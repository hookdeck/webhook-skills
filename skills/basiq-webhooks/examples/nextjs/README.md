# Basiq Webhooks - Next.js Example

Minimal example of receiving [Basiq](https://basiq.io) webhooks with signature verification in a Next.js App Router route handler. Basiq signs deliveries with the Standard Webhooks scheme, so the route verifies `webhook-id`, `webhook-timestamp` and `webhook-signature` with the [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) package. If `webhook-id` is absent it falls back to the `svix-*` headers, as Hookdeck does.

## Prerequisites

- Node.js 20+
- A Basiq application and API access
- The signing secret (`whsec_...`) of your webhook subscription

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Put the subscription's signing secret in `BASIQ_WEBHOOK_SECRET`, including the `whsec_` prefix. It is returned as `secret` when you create the subscription (see [setup](../../references/setup.md)).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/basiq`.

## Test

```bash
npm test
```

The tests sign payloads the way Basiq does and cover tampered bodies, stale and future timestamps, multiple signatures, another subscription's secret, the `svix-*` header fallback, resent messages, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 basiq --path /webhooks/basiq
```

Create a subscription with `POST /notifications/webhooks` using the printed URL, then send a test message with `POST /notifications/messages/test`. A new subscription can take up to 15 minutes to start delivering.

## Notes

- The route reads `await request.text()` so the HMAC covers the exact bytes Basiq sent. Calling `request.json()` first breaks verification.
- If `BASIQ_WEBHOOK_SECRET` is unset the route returns `500` and rejects the delivery.
- The library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so use the manual verifier in [references/verification.md](../../references/verification.md) if you need to widen or drop it.
- Payloads are thin (`eventTypeId`, `eventId`, `links`). Fetch `links.eventEntity` from the Basiq API for the data.
