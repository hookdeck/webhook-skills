# Airwallex Webhooks - Express Example

Minimal example of receiving Airwallex webhooks with signature verification.

## Prerequisites

- Node.js 18+
- Airwallex account with a webhook endpoint secret
  (Web app → Developer → Webhooks)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Airwallex webhook secret to `.env` as `AIRWALLEX_WEBHOOK_SECRET`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

The tests generate real Airwallex signatures (HMAC-SHA256 over
`x-timestamp + raw_body`, hex-encoded) and assert the handler accepts valid
requests and rejects missing, invalid, tampered, and stale ones.

## Receive real webhooks locally

Use the Hookdeck CLI (no account required) to tunnel Airwallex webhooks to your
local server:

```bash
npx hookdeck-cli listen 3000 airwallex --path /webhooks/airwallex
```

Register the printed HTTPS URL as a webhook under Developer → Webhooks in the
Airwallex web app, then re-trigger a past event from Settings → Developer → Events.

## How verification works

Airwallex sends two headers with each webhook:

- `x-timestamp` — send time as a Unix timestamp in **milliseconds**
- `x-signature` — HMAC-SHA256 **hex** digest of `x-timestamp + raw_body`

The handler mounts `express.raw()` so it can hash the **raw** body (never
re-serialized JSON), verifies the signature with a constant-time compare, then
parses and dispatches on the event `name` field. See
[../../references/verification.md](../../references/verification.md) for details.

## Endpoint

- `POST /webhooks/airwallex` - Receives and verifies Airwallex webhook events
- `GET /health` - Health check
