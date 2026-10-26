# Treet Webhooks - Express Example

Minimal example of receiving Treet webhooks and verifying the `X-Treet-Signature` header (base64 HMAC-SHA256 of the raw body).

## Prerequisites

- Node.js 18+
- A secret key from Treet support (see [references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put the secret key Treet gave you into `.env` as `TREET_WEBHOOK_SECRET`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts GET, POST, PUT, PATCH and DELETE on `/webhooks/treet`. The body is read with `express.raw({ type: '*/*' })`, so any content type works and the exact bytes are verified.

## Test

```bash
npm test
```

To receive real webhooks locally, tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 treet --path /webhooks/treet
```

Or send one by hand:

```bash
BODY='{"topic":"label","trigger":"label/created","bundleId":"abc"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$TREET_WEBHOOK_SECRET" -binary | base64)
curl -X POST http://localhost:3000/webhooks/treet \
  -H 'Content-Type: application/json' -H "X-Treet-Signature: $SIG" -d "$BODY"
```
