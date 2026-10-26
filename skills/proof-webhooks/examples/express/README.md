# Proof Webhooks - Express Example

Minimal example of receiving Proof (proof.com, formerly Notarize) webhooks with signature verification.

## Prerequisites

- Node.js 18+
- A Proof account with a Webhooks V2 subscription (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the secret to `.env` as `PROOF_WEBHOOK_SECRET`. Paste the Proof API key that created the webhook, or its signing_key if you set one. Webhooks created with OAuth must set a signing_key.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the test suite (generates real signatures and verifies the endpoint):

```bash
npm test
```

### Receive live webhooks locally

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 3000 proof --path /webhooks/proof
```

Use the tunnel URL as the `url` of a Proof webhook subscription, then trigger a transaction event.

## How It Works

- Uses `express.raw({ type: '*/*' })` so verification runs on the **raw** body for any content type.
- Reads the `X-Notarize-Signature` header: bare lowercase hex HMAC-SHA256 of the raw body, keyed with `PROOF_WEBHOOK_SECRET`.
- Checks the header is exactly 64 hex characters, then compares with `crypto.timingSafeEqual`.
- Returns `401` for a missing, malformed or mismatched signature; parses JSON only after it passes.
- Dispatches on the body's `event` field and returns `200` (anything else is retried).

## Endpoint

- `POST /webhooks/proof` - Receives and verifies Proof webhook events
- `GET /health` - Health check
