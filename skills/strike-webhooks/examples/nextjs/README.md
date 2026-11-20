# Strike Webhooks - Next.js Example

Minimal Next.js (App Router) example of receiving [Strike](https://strike.me) (Bitcoin/Lightning payments) webhooks: verify the `X-Webhook-Signature` HMAC-SHA256, return `200` straight away, then fetch the entity by `data.entityId` from the Strike API inside `after()`.

## Prerequisites

- Node.js 20+
- A Strike account with an API key (dashboard.strike.me) and a webhook subscription created with `POST /v1/subscriptions` (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. In `.env.local`, set:
   - `STRIKE_WEBHOOK_SECRET`: the `secret` you passed when creating the subscription (you generate it, 10-50 characters, e.g. `openssl rand -hex 24`). This verifies deliveries.
   - `STRIKE_API_KEY`: your Strike API key. It is only used for the fetch-back call, never for verification.
   - `STRIKE_WEBHOOK_SECRET_PREVIOUS`: optional, the old secret while you rotate.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/strike` in [app/webhooks/strike/route.ts](app/webhooks/strike/route.ts). Verification and the event-to-endpoint map live in [lib/strike.ts](lib/strike.ts).

## Test

```bash
npm test
```

The tests sign payloads with HMAC-SHA256 and check: a valid signature (with the fetch-back deferred until after the response), all 14 documented event types, an unknown event type (200), dedupe on `id`, a `v2` payload, the previous secret during rotation, the API key used as the key (401), a tampered body, missing and wrong-length headers (401), a missing secret (401), invalid JSON (400), and the API path for each event family.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 strike --path /webhooks/strike
```

Use the printed URL as `webhookUrl` when you create the subscription (`POST /v1/subscriptions`), then trigger an event, for example by creating an invoice in the Strike sandbox.

## Notes

- The route reads `request.arrayBuffer()` and verifies those bytes before parsing. Don't call `request.json()` first: re-serialising the body can change the bytes.
- Strike cancels a delivery that takes longer than 5 seconds. `after()` from `next/server` runs the fetch-back once the response has been sent. For heavy work, hand off to a queue.
- Next.js answers unimplemented methods with `405`. Avoid `410`/`501` on this route: either tells Strike to stop retrying.
- The in-memory dedupe set is for the demo (and doesn't survive across serverless instances). Use a unique constraint on the event `id` in your database.
