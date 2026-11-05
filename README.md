# Brevo mass mail — LEAGUES CUP

Script aislado en Downloads\brevo-mass-mail (no modifica BackendCL ni FrontClubLeon).

## Resultados actuales

- Emails únicos: 1057 (RTDB + Firestore usuariosApp)
- Prueba real: 5/5 enviados OK con messageId de Brevo
- Reporte de evidencia (captura): out\reports\send-report-2026-08-05T20-02-49-149Z.html

## Setup

cd C:\Users\zurie\Downloads\brevo-mass-mail
npm install --strict-ssl=false

Si tu red tiene proxy/SSL corporativo:
$env:NODE_TLS_REJECT_UNAUTHORIZED = "0"

## Comandos

npm run extract
npm run preview
npm run send:test5
npm run send:all

Flags: --dry-run | --limit=N | --no-resume

## Evidencia

1. Abre out\reports\send-report-*.html y toma captura.
2. Brevo: Transactional -> Email -> Logs, filtro asunto LEAGUES CUP.

## Seguridad

Credenciales solo en .env. Rota la API key si se expuso.
