# Qlik Cloud Webhooks - Express Example

Minimal example of receiving Qlik Cloud webhooks and verifying the `qlik-signature` header (hex HMAC-SHA256 of the raw body).

## Prerequisites

- Node.js 18+
- A Qlik Cloud webhook with a secret (32-64 characters). Without a secret Qlik Cloud sends no signature (see [references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put the webhook's secret into `.env` as `QLIK_CLOUD_WEBHOOK_SECRET`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts GET, POST, PUT, PATCH and DELETE on `/webhooks/qlik-cloud`. The body is read with `express.raw({ type: '*/*' })`, so any content type works and the exact bytes are verified before anything is parsed.

## Test

```bash
npm test
```

To receive real events locally, tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 qlik-cloud --path /webhooks/qlik-cloud
```

Or send one by hand:

```bash
BODY='{"type":"com.qlik.v1.reload.finished","data":{"succeeded":true}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$QLIK_CLOUD_WEBHOOK_SECRET" -hex | awk '{print $NF}')
curl -X POST http://localhost:3000/webhooks/qlik-cloud \
  -H 'Content-Type: application/json' -H "qlik-signature: $SIG" -d "$BODY"
```
