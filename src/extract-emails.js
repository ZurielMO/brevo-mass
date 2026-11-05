const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const EMAIL_KEYS = new Set(["correo", "email", "mail", "e-mail"]);

function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return null;
  return email;
}

function walkCollect(node, source, bag, depth = 0) {
  if (!node || typeof node !== "object" || depth > 12) return;
  if (Array.isArray(node)) {
    for (const item of node) walkCollect(item, source, bag, depth + 1);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "string" && EMAIL_KEYS.has(key.toLowerCase())) {
      const email = normalizeEmail(value);
      if (!email) {
        bag.invalid += 1;
        continue;
      }
      if (!bag.map.has(email)) {
        bag.map.set(email, { email, sources: new Set([source]) });
      } else {
        bag.map.get(email).sources.add(source);
      }
      bag.raw += 1;
      bag.bySource[source] = (bag.bySource[source] || 0) + 1;
    } else if (value && typeof value === "object") {
      walkCollect(value, source, bag, depth + 1);
    }
  }
}

function extractFromRtdb(jsonPath, bag) {
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`RTDB JSON no encontrado: ${jsonPath}`);
  }
  console.log(`Leyendo RTDB JSON (${jsonPath})...`);
  const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const preferred = ["InfoPropietarios", "SolicitudesCitas", "usuarios"];
  const tops = [
    ...preferred.filter((k) => data[k]),
    ...Object.keys(data).filter((k) => !preferred.includes(k)),
  ];
  for (const top of tops) {
    walkCollect(data[top], `rtdb:${top}`, bag);
  }
}

async function extractFromFirestoreRest(bag) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  const saPath = process.env.FIRESTORE_SERVICE_ACCOUNT_PATH;
  const projectId = process.env.FIRESTORE_PROJECT_ID || "app-oficial-leon";
  const collection =
    process.env.FIRESTORE_USERS_COLLECTION || "usuariosApp";

  if (!saPath || !fs.existsSync(saPath)) {
    console.warn(
      `Firestore REST omitido: service account no encontrado (${saPath || "sin path"})`,
    );
    return;
  }

  const { GoogleAuth } = require("google-auth-library");
  const https = require("https");
  const axios = require("axios");
  const agent = new https.Agent({ rejectUnauthorized: false });

  const auth = new GoogleAuth({
    keyFile: saPath,
    scopes: [
      "https://www.googleapis.com/auth/datastore",
      "https://www.googleapis.com/auth/cloud-platform",
    ],
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const accessToken = tokenResponse.token || tokenResponse;

  console.log(`Leyendo Firestore REST ${projectId}/${collection}...`);
  let pageToken = "";
  let page = 0;
  do {
    const url =
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}` +
      `?pageSize=300` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      httpsAgent: agent,
      timeout: 60000,
    });
    const docs = response.data.documents || [];
    page += 1;
    for (const doc of docs) {
      const fields = doc.fields || {};
      const emailValue =
        (fields.email && fields.email.stringValue) ||
        (fields.correo && fields.correo.stringValue) ||
        "";
      const email = normalizeEmail(emailValue);
      if (!email) {
        if (emailValue) bag.invalid += 1;
        continue;
      }
      if (!bag.map.has(email)) {
        bag.map.set(email, {
          email,
          sources: new Set(["firestore:usuariosApp"]),
        });
      } else {
        bag.map.get(email).sources.add("firestore:usuariosApp");
      }
      bag.raw += 1;
      bag.bySource["firestore:usuariosApp"] =
        (bag.bySource["firestore:usuariosApp"] || 0) + 1;
    }
    pageToken = response.data.nextPageToken || "";
    console.log(
      `  página REST ${page}: +${docs.length} docs (únicos=${bag.map.size})`,
    );
  } while (pageToken);
}

async function extractFromFirestore(bag) {
  const saPath = process.env.FIRESTORE_SERVICE_ACCOUNT_PATH;
  const projectId = process.env.FIRESTORE_PROJECT_ID || "app-oficial-leon";
  const collection =
    process.env.FIRESTORE_USERS_COLLECTION || "usuariosApp";

  if (!saPath || !fs.existsSync(saPath)) {
    console.warn(
      `Firestore omitido: service account no encontrado (${saPath || "sin path"})`,
    );
    return;
  }

  const admin = require("firebase-admin");
  const serviceAccount = JSON.parse(fs.readFileSync(saPath, "utf8"));
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId,
    });
  }

  const db = admin.firestore();
  console.log(`Leyendo Firestore ${projectId}/${collection}...`);
  let lastDoc = null;
  let page = 0;
  while (true) {
    let query = db.collection(collection).orderBy("__name__").limit(500);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snap = await query.get();
    if (snap.empty) break;
    page += 1;
    for (const doc of snap.docs) {
      const data = doc.data() || {};
      const email = normalizeEmail(data.email || data.correo || "");
      if (!email) {
        if (data.email || data.correo) bag.invalid += 1;
        continue;
      }
      if (!bag.map.has(email)) {
        bag.map.set(email, { email, sources: new Set(["firestore:usuariosApp"]) });
      } else {
        bag.map.get(email).sources.add("firestore:usuariosApp");
      }
      bag.raw += 1;
      bag.bySource["firestore:usuariosApp"] =
        (bag.bySource["firestore:usuariosApp"] || 0) + 1;
    }
    lastDoc = snap.docs[snap.docs.length - 1];
    console.log(`  página ${page}: +${snap.size} docs (únicos=${bag.map.size})`);
    if (snap.size < 500) break;
  }
}

function toCsv(rows) {
  const header = "email,sources\n";
  const body = rows
    .map((r) => {
      const sources = Array.from(r.sources).sort().join("|");
      return `${r.email},"${sources}"`;
    })
    .join("\n");
  return header + body + (rows.length ? "\n" : "");
}

function parseArgs(argv) {
  const args = { firestoreOnly: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--firestore-only") args.firestoreOnly = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const outDir = path.join(__dirname, "..", "out");
  fs.mkdirSync(outDir, { recursive: true });

  const bag = {
    map: new Map(),
    raw: 0,
    invalid: 0,
    bySource: {},
  };

  const rtdbPath =
    process.env.RTDB_JSON_PATH ||
    "C:\\Users\\zurie\\Downloads\\palcos-4c763-default-rtdb-export.json";

  if (!args.firestoreOnly) {
    extractFromRtdb(rtdbPath, bag);
  } else {
    console.log("Modo --firestore-only: se omite RTDB.");
  }
  try {
    await extractFromFirestore(bag);
  } catch (error) {
    console.warn(
      "Firestore Admin SDK falló, probando REST:",
      error && error.message ? error.message : error,
    );
    try {
      await extractFromFirestoreRest(bag);
    } catch (restError) {
      console.warn(
        "Firestore REST omitido por error:",
        restError && restError.message ? restError.message : restError,
      );
    }
  }

  // Firestore-only: keep document-id order so "first N" matches DB order.
  const rows = args.firestoreOnly
    ? Array.from(bag.map.values())
    : Array.from(bag.map.values()).sort((a, b) => a.email.localeCompare(b.email));
  const csvPath = path.join(outDir, "emails-unicos.csv");
  const jsonPath = path.join(outDir, "emails-unicos.json");
  const statsPath = path.join(outDir, "extract-stats.json");

  fs.writeFileSync(csvPath, toCsv(rows), "utf8");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      rows.map((r) => ({ email: r.email, sources: Array.from(r.sources) })),
      null,
      2,
    ),
    "utf8",
  );

  const stats = {
    generatedAt: new Date().toISOString(),
    rawMatches: bag.raw,
    invalid: bag.invalid,
    unique: rows.length,
    firestoreOnly: args.firestoreOnly,
    order: args.firestoreOnly ? "firestore-document-id" : "email-alphabetical",
    bySource: bag.bySource,
    outputs: { csvPath, jsonPath },
  };
  fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2), "utf8");

  console.log("\n=== EXTRACT OK ===");
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((err) => {
  console.error("extract failed:", err.message || err);
  process.exit(1);
});


