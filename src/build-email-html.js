const EMAIL_SUBJECT = "FOOD GOL MARKET DIRECTO A TU PALCO";
const PALCOS_URL = "https://foodmarket.clubleon.mx/servicio-palcos";
const EMAIL_TEXT = `FOOD GOL MARKET
DIRECTO A TU PALCO
PIDE AHORA

Tu comida favorita, sin perderte ni un minuto del partido.
ESCANEA · ORDENA · DISFRUTA

${PALCOS_URL}`;
const IMAGE_URL =
  "https://firebasestorage.googleapis.com/v0/b/app-oficial-leon.firebasestorage.app/o/mailings%2Ffoodgol_palcos.jpg?alt=media&token=68110720-36f1-4cf7-9270-ca9d263750be";

function buildEmailHtml() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FOOD GOL MARKET DIRECTO A TU PALCO</title>
</head>
<body style="margin:0;padding:0;background:#f7faf8;font-family:Arial,Helvetica,sans-serif;color:#222222;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7faf8;padding:20px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #d7e8e1;border-collapse:collapse;">
          <tr>
            <td style="height:6px;background:#006A54;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:18px 20px 8px 20px;">
              <p style="margin:0;font-size:13px;letter-spacing:0.4px;color:#006A54;font-weight:bold;">CLUB LE&#211;N</p>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 20px 18px 20px;font-size:15px;line-height:1.55;color:#222222;">
              <p style="margin:0 0 6px 0;font-size:18px;font-weight:bold;color:#006A54;letter-spacing:0.4px;" translate="no">
                FOOD GOL MARKET
              </p>
              <p style="margin:0 0 6px 0;font-size:16px;font-weight:bold;color:#006A54;letter-spacing:0.3px;" translate="no">
                DIRECTO A TU PALCO
              </p>
              <p style="margin:0 0 16px 0;font-size:16px;font-weight:bold;color:#006A54;letter-spacing:0.3px;" translate="no">
                PIDE AHORA
              </p>
              <p style="margin:0 0 14px 0;font-size:16px;color:#222222;" translate="no">
                Tu comida favorita, sin perderte ni un minuto del partido.
              </p>
              <p style="margin:0 0 14px 0;font-size:15px;font-weight:bold;letter-spacing:0.6px;color:#006A54;" translate="no">
                ESCANEA &#183; ORDENA &#183; DISFRUTA
              </p>
              <p style="margin:0;font-size:13px;line-height:1.4;word-break:break-all;">
                <a href="${PALCOS_URL}" style="color:#006A54;text-decoration:underline;">${PALCOS_URL}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 20px 20px 20px;font-size:0;line-height:0;" align="center">
              <a href="${PALCOS_URL}" style="display:block;text-decoration:none;">
                <img src="${IMAGE_URL}" alt="Servicio de alimentos y bebidas para palcos. Food Gol Market." width="560" height="866" style="display:block;width:100%;max-width:560px;height:auto;border:0;" />
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = { buildEmailHtml, EMAIL_SUBJECT, EMAIL_TEXT, PALCOS_URL };
