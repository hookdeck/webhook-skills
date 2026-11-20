# Strike Webhooks - Express Example

Minimal Express example of receiving [Strike](https://strike.me) (Bitcoin/Lightning payments) webhooks: verify the `X-Webhook-Signature` HMAC-SHA256, return `200` straight away, then fetch the entity by `data.entityId` from the Strike API.

## Prerequisites

- Node.js 18+
- A Strike account with an API key (dashboard.strike.me) and a webhook subscription created with `POST /v1/subscriptions` (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. In `.env`, set:
   - `STRIKE_WEBHOOK_SECRET`: the `secret` you passed when creating the subscription (you generate it, 10-50 characters, e.g. `openssl rand -hex 24`). This verifies deliveries.
   - `STRIKE_API_KEY`: your Strike API key. It is only used for the fetch-back call, never for verification.
   - `STRIKE_WEBHOOK_SECRET_PREVIOUS`: optional, the old secret while you rotate.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/strike` in [src/index.js](src/index.js).

## Test

```bash
npm test
```

The tests sign payloads with HMAC-SHA256 and check: a valid signature, all 14 documented event types, an unknown event type (200), a redelivered event (deduped on `id`), a `v2` payload (acknowledged, not processed), the previous secret during rotation, the API key used as the key (401), a tampered body, missing and wrong-length headers (401, never 500), a missing secret (401), invalid JSON (400), that the response doesn't wait for the fetch-back, and the API path for each event family.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 strike --path /webhooks/strike
```

Use the printed URL as `webhookUrl` when you create the subscription (`POST /v1/subscriptions`), then trigger an event, for example by creating an invoice in the Strike sandbox.

## Notes

- The route uses `express.raw({ type: '*/*' })`. The HMAC covers the exact raw body, so don't put `express.json()` in front of it. Strike's own JavaScript sample re-serialises the parsed body with `JSON.stringify`; hashing the raw bytes is the same check without that fragility.
- Strike cancels a delivery that takes longer than 5 seconds and retries it (up to 12 attempts over about 9 days). The handler responds first and does the fetch-back afterwards; in production, hand the event to a queue instead of `setImmediate`.
- `410` or `501` tells Strike to stop retrying. Don't return either by accident.
- The in-memory dedupe set is for the demo. Use a unique constraint on the event `id` in your database.
