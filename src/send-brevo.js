const fs = require("fs");
const path = require("path");
const axios = require("axios");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { buildEmailHtml, EMAIL_SUBJECT, EMAIL_TEXT } = require("./build-email-html");

function parseArgs(argv) {
  const args = { dryRun: false, limit: null, resume: true, to: null, list: null };
  for (const raw of argv.slice(2)) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw.startsWith("--limit=")) {
      args.limit = Number(raw.split("=")[1]);
    } else if (raw.startsWith("--to=")) {
      args.to = raw.split("=")[1].trim().toLowerCase();
    } else if (raw.startsWith("--list=")) {
      args.list = raw.slice("--list=".length).trim();
    } else if (raw === "--no-resume") args.resume = false;
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadEmails(csvPath) {
  const text = fs.readFileSync(csvPath, "utf8").trim();
  const lines = text.split(/\r?\n/).slice(1);
  const emails = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const email = line.split(",")[0].trim().toLowerCase();
    if (email) emails.push(email);
  }
  return emails;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function loadEmailsFromTxt(txtPath) {
  const lines = fs.readFileSync(txtPath, "utf8").split(/\r?\n/);
  const emails = [];
  const seen = new Set();
  for (const line of lines) {
    const email = line.trim().toLowerCase();
    if (!EMAIL_RE.test(email) || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  return emails;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function writeReports(outDir, rows, summary) {
  fs.mkdirSync(path.join(outDir, "reports"), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const csvPath = path.join(outDir, "reports", `send-report-${stamp}.csv`);
  const htmlPath = path.join(outDir, "reports", `send-report-${stamp}.html`);

  const csv =
    "email,status,messageId,timestamp,error\n" +
    rows
      .map((r) => {
        const err = (r.error || "").replace(/"/g, "'");
        return `${r.email},${r.status},${r.messageId || ""},${r.timestamp},"${err}"`;
      })
      .join("\n") +
    "\n";
  fs.writeFileSync(csvPath, csv, "utf8");

  const rowsHtml = rows
    .map((r) => {
      const color = r.status === "sent" ? "#166534" : r.status === "dry-run" ? "#1d4ed8" : "#b91c1c";
      return `<tr>
        <td>${escapeHtml(r.email)}</td>
        <td style="color:${color};font-weight:700;">${escapeHtml(r.status)}</td>
        <td style="font-family:monospace;font-size:12px;">${escapeHtml(r.messageId || "-")}</td>
        <td>${escapeHtml(r.timestamp)}</td>
        <td>${escapeHtml(r.error || "")}</td>
      </tr>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Reporte envío ${escapeHtml(EMAIL_SUBJECT)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; background: #f8fafc; color: #0f172a; }
    .card { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
    h1 { margin: 0 0 8px; color: #006A54; }
    .stats { display: flex; gap: 16px; margin: 16px 0 24px; flex-wrap: wrap; }
    .stat { background: #f1f5f9; border-radius: 8px; padding: 12px 16px; min-width: 140px; }
    .ok { color: #166534; font-weight: 700; font-size: 22px; }
    .bad { color: #b91c1c; font-weight: 700; font-size: 22px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #ecfdf5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Evidencia de envío</h1>
    <p>Generado: ${escapeHtml(summary.generatedAt)}</p>
    <p>Modo: <strong>${escapeHtml(summary.mode)}</strong> | Asunto: <strong>${escapeHtml(EMAIL_SUBJECT)}</strong></p>
    <div class="stats">
      <div class="stat"><div>Total</div><div class="ok">${summary.total}</div></div>
      <div class="stat"><div>Enviados</div><div class="ok">${summary.sent}</div></div>
      <div class="stat"><div>Fallidos</div><div class="bad">${summary.failed}</div></div>
      <div class="stat"><div>Dry-run</div><div class="ok">${summary.dryRun}</div></div>
    </div>
    <table>
      <thead>
        <tr><th>Email</th><th>Status</th><th>messageId (Brevo)</th><th>Timestamp</th><th>Error</th></tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
    <p style="margin-top:20px;font-size:13px;color:#64748b;">
      También puedes verificar en Brevo → Transactional → Email → Logs filtrando por asunto ${escapeHtml(EMAIL_SUBJECT)}.
    </p>
  </div>
</body>
</html>`;
  fs.writeFileSync(htmlPath, html, "utf8");
  return { csvPath, htmlPath };
}

async function sendOne({ apiKey, senderEmail, senderName, to, html }) {
  const payload = {
    sender: { email: senderEmail, name: senderName },
    replyTo: { email: senderEmail, name: senderName },
    to: [{ email: to }],
    subject: EMAIL_SUBJECT,
    htmlContent: html,
    textContent: EMAIL_TEXT,
    headers: {
      "List-Unsubscribe": `<mailto:${senderEmail}?subject=unsubscribe>`,
    },
  };

  const response = await axios.post(
    "https://api.brevo.com/v3/smtp/email",
    payload,
    {
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      timeout: 30000,
      validateStatus: () => true,
    },
  );

  if (response.status >= 200 && response.status < 300) {
    return {
      ok: true,
      messageId: response.data?.messageId || response.data?.messageIds?.[0] || "",
    };
  }

  const msg =
    response.data?.message ||
    response.data?.error ||
    `HTTP ${response.status}`;
  const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  err.status = response.status;
  throw err;
}

async function sendWithRetry(fn, retries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = error.status || error.response?.status;
      if (status && status !== 429 && status < 500) throw error;
      const wait = attempt * 1500;
      console.warn(`  reintento ${attempt}/${retries} en ${wait}ms...`);
      await sleep(wait);
    }
  }
  throw lastError;
}

async function main() {
  const args = parseArgs(process.argv);
  const root = path.join(__dirname, "..");
  const outDir = path.join(root, "out");
  const csvPath = path.join(outDir, "emails-unicos.csv");
  const checkpointPath = path.join(outDir, "checkpoint.json");
  const previewPath = path.join(outDir, "preview.html");

  const listPath = args.list
    ? path.isAbsolute(args.list)
      ? args.list
      : path.join(root, args.list)
    : null;

  if (!args.to && listPath && !fs.existsSync(listPath)) {
    throw new Error(`Lista no encontrada: ${listPath}`);
  }
  if (!args.to && !listPath && !fs.existsSync(csvPath)) {
    throw new Error("Falta out/emails-unicos.csv. Corre primero: npm run extract");
  }

  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || "no-reply@clubleon.com";
  const senderName = process.env.BREVO_SENDER_NAME || "Club León";
  const delayMs = Number(process.env.SEND_DELAY_MS || 250);

  if (!args.dryRun && !apiKey) {
    throw new Error("BREVO_API_KEY faltante en .env");
  }

  const html = buildEmailHtml();
  fs.writeFileSync(previewPath, html, "utf8");

  let emails;
  const alreadySent = new Set();
  if (args.to) {
    emails = [args.to];
  } else {
    emails = listPath ? loadEmailsFromTxt(listPath) : loadEmails(csvPath);
    if (args.resume && fs.existsSync(checkpointPath)) {
      const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
      for (const item of checkpoint.sent || []) alreadySent.add(item);
      console.log(`Checkpoint: ${alreadySent.size} ya enviados, se omitirán`);
    }

    emails = emails.filter((e) => !alreadySent.has(e));
    if (args.limit && args.limit > 0) {
      emails = emails.slice(0, args.limit);
    }
  }

  console.log(`Destinatarios a procesar: ${emails.length}`);
  console.log(`Modo: ${args.dryRun ? "DRY-RUN" : "ENVÍO REAL"}`);
  console.log(`Preview HTML: ${previewPath}`);

  const rows = [];
  let sent = 0;
  let failed = 0;
  let dryRun = 0;

  for (let i = 0; i < emails.length; i += 1) {
    const email = emails[i];
    const timestamp = new Date().toISOString();
    process.stdout.write(`[${i + 1}/${emails.length}] ${email} ... `);

    if (args.dryRun) {
      dryRun += 1;
      rows.push({
        email,
        status: "dry-run",
        messageId: "",
        timestamp,
        error: "",
      });
      console.log("dry-run");
      continue;
    }

    try {
      const result = await sendWithRetry(() =>
        sendOne({
          apiKey,
          senderEmail,
          senderName,
          to: email,
          html,
        }),
      );
      sent += 1;
      alreadySent.add(email);
      rows.push({
        email,
        status: "sent",
        messageId: result.messageId || "",
        timestamp,
        error: "",
      });
      if (!args.to) {
        fs.writeFileSync(
          checkpointPath,
          JSON.stringify(
            {
              updatedAt: timestamp,
              sent: Array.from(alreadySent),
            },
            null,
            2,
          ),
          "utf8",
        );
      }
      console.log(`OK ${result.messageId || ""}`);
    } catch (error) {
      failed += 1;
      const message = error.response?.data?.message || error.message || "error";
      rows.push({
        email,
        status: "failed",
        messageId: "",
        timestamp,
        error: typeof message === "string" ? message : JSON.stringify(message),
      });
      console.log(`FAIL ${message}`);
    }

    if (delayMs > 0) await sleep(delayMs);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    mode: args.dryRun ? "dry-run" : "live",
    total: rows.length,
    sent,
    failed,
    dryRun,
  };
  const reports = writeReports(outDir, rows, summary);

  console.log("\n=== SEND SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Reporte HTML (captura): ${reports.htmlPath}`);
  console.log(`Reporte CSV: ${reports.csvPath}`);
}

main().catch((err) => {
  console.error("send failed:", err.message || err);
  process.exit(1);
});

