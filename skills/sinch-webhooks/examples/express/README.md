# Sinch Webhooks - Express Example

Minimal example of receiving Sinch Conversation API callbacks with signature verification. Sinch has no verification helper for this scheme, so the HMAC check is manual.

> For Sinch Conversation API callbacks. Set a secret on the Conversation API webhook and paste it here; other Sinch APIs sign callbacks differently.

## Prerequisites

- Node.js 20+
- A Sinch Conversation API webhook with a `secret`

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your webhook secret to `.env` as `SINCH_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Run the tests

```bash
npm test
```

The tests sign payloads with the real Sinch algorithm (base64 HMAC-SHA256 of `body.nonce.timestamp`), include the vendor's published test vector, and cover valid, invalid, tampered, malformed and opt-in-tolerance requests.

### Send a signed test callback

```bash
node -e '
const c = require("crypto");
const body = JSON.stringify({ project_id: "p", message_delivery_report: { message_id: "m1", status: "DELIVERED" } });
const nonce = "testnonce1", ts = String(Math.floor(Date.now() / 1000));
const sig = c.createHmac("sha256", process.env.SINCH_WEBHOOK_SECRET).update(body + "." + nonce + "." + ts).digest("base64");
fetch("http://localhost:3000/webhooks/sinch", { method: "POST", headers: { "Content-Type": "application/json", "x-sinch-webhook-signature": sig, "x-sinch-webhook-signature-nonce": nonce, "x-sinch-webhook-signature-timestamp": ts }, body }).then((r) => console.log(r.status));
'
```

A valid callback returns `200`; a wrong secret or signature returns `401`.

### Receive real callbacks locally

```bash
npx hookdeck-cli listen 3000 sinch --path /webhooks/sinch
```

Use the public URL the CLI prints as the webhook `target` on your Conversation API app.

## Endpoint

- `POST /webhooks/sinch` - Receives and verifies Sinch Conversation API callbacks (200 / 401)
- `GET /health` - Health check
