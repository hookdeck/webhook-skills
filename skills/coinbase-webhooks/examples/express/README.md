# Coinbase (CDP) Webhooks - Express Example

Minimal example of receiving Coinbase Developer Platform (CDP) webhooks with
signature verification. The CDP SDK has no webhook-verification helper, so the
handler verifies `X-Webhook-Signature` manually (HMAC-SHA256, hex).

## Prerequisites

- Node.js 18+
- A CDP webhook subscription and the `secret` from its create response
  (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `COINBASE_WEBHOOK_SECRET` in `.env` to the subscription secret.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

The tests sign payloads with real HMAC-SHA256 `v0`/`v1` signatures:

```bash
npm test
```

### Receive real webhooks locally

CDP only delivers to HTTPS URLs. Forward deliveries to your local server with the
Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 coinbase --path /webhooks/coinbase
```

Use the HTTPS URL it prints as `target.url` when you create the subscription.

## How It Works

- `express.raw({ type: 'application/json' })` keeps the **raw body**. The signature
  covers the exact bytes, so `express.json()` breaks verification.
- Reads `X-Webhook-Signature`, falling back to the deprecated `X-Hook0-Signature`.
- Parses `t`, `v0`, `h`, `v1` by key (order isn't guaranteed). Verifies `v1` over
  `{t}.{h}.{headerValues}.{body}` when `v1` and `h` are present, otherwise `v0`
  over `{t}.{body}`.
- Rejects timestamps more than 5 minutes off, malformed hex (400, not a crash) and
  mismatches. An unset secret returns 500.
- Routes on the `X-Event-Type` header and de-duplicates on `X-Event-Id`.

## Endpoint

- `POST /webhooks/coinbase` - Receives and verifies CDP webhooks
- `GET /health` - Health check
