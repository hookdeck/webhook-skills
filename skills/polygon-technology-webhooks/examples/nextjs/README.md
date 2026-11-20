# Polygon Technology Webhooks - Next.js Example

Minimal Next.js (App Router) example of receiving [Polygon Technology](https://docs.polygon.technology/payments/) OMS payments webhooks: verifying `Webhook-Signature`, deduplicating on `id` and `idempotencyKey`, and ordering by `createdAt`.

## Prerequisites

- Node.js 20+
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
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/polygon-technology` in [app/webhooks/polygon-technology/route.ts](app/webhooks/polygon-technology/route.ts). Verification and event handling live in [lib/polygon-technology.ts](lib/polygon-technology.ts).

## Test

```bash
npm test
```

The tests sign payloads the way OMS does (`t=<t>,v1=<hex HMAC-SHA256 of "<t>.<body>">`) and cover the same cases as the Express example: header parsing, encodings, the 300 second window, bad signatures, dedupe, ordering, unknown types, pre-v1 events, invalid JSON and a missing key.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 polygon-technology --path /webhooks/polygon-technology
```

Register the printed HTTPS URL with `POST /webhooks`, then send a signed test delivery with `POST /webhooks/{webhookId}/test`.

## Notes

- The route reads `await request.text()` before parsing. The HMAC covers the exact raw body, so never call `request.json()` first or re-serialize the parsed object.
- Bad signatures get `401`, as in the OMS docs. OMS retries any non-2xx.
- The dedupe and ordering stores are in memory. Use a database with unique constraints in production, and return 2xx before slow work: each attempt times out after `timeoutMs` (default 5000 ms).
