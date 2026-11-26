# Polygon Technology Webhooks - Express Example

Minimal Express example of receiving [Polygon Technology](https://docs.polygon.technology/payments/) OMS payments webhooks: verifying `Webhook-Signature`, deduplicating on `id` and `idempotencyKey`, and ordering by `createdAt`.

## Prerequisites

- Node.js 18+
- An OMS API key and a webhook subscription's `signingKey` (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `OMS_WEBHOOK_SIGNING_KEY` in `.env` to the cleartext `signingKey` that `POST /webhooks` returned, as-is.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/polygon-technology` in [src/index.js](src/index.js).

## Test

```bash
npm test
```

The tests sign payloads the way OMS does (`t=<t>,v1=<hex HMAC-SHA256 of "<t>.<body>">`) and cover a valid delivery, header parts in any order, a missing `t` or `v1`, base64 and unprefixed HMACs, a short signature, the 300 second window in both directions, another key, a tampered body, a missing header, duplicates by `id` and by `idempotencyKey`, a stale `createdAt`, an unknown type, a pre-v1 event, invalid JSON and a missing key.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 polygon-technology --path /webhooks/polygon-technology
```

Register the printed HTTPS URL with `POST /webhooks`, then send a signed test delivery with `POST /webhooks/{webhookId}/test`.

## Notes

- The route uses `express.raw({ type: 'application/json' })`. The HMAC covers the exact raw body, so don't put `express.json()` in front of it.
- Bad signatures get `401`, as in the OMS docs. OMS retries any non-2xx.
- The dedupe and ordering stores are in memory. Use a database with unique constraints in production, and return 2xx before slow work: each attempt times out after `timeoutMs` (default 5000 ms).
