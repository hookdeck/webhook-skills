# Basiq Webhooks - Express Example

Minimal example of receiving [Basiq](https://basiq.io) webhooks with signature verification. Basiq signs deliveries with the Standard Webhooks scheme, so the handler verifies the `webhook-id`, `webhook-timestamp` and `webhook-signature` headers with the [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) package. If `webhook-id` is absent it falls back to the `svix-*` headers, as Hookdeck does.

## Prerequisites

- Node.js 18+
- A Basiq application and API access
- The signing secret (`whsec_...`) of your webhook subscription

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put the subscription's signing secret in `BASIQ_WEBHOOK_SECRET`, including the `whsec_` prefix. It is returned as `secret` when you create the subscription (see [setup](../../references/setup.md)).

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/basiq`.

## Test

```bash
npm test
```

The tests sign payloads the way Basiq does (`base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{webhook-id}.{webhook-timestamp}.{raw body}"))`). They cover tampered bodies, stale and future timestamps, multiple signatures, another subscription's secret, the `svix-*` header fallback, resent messages, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 basiq --path /webhooks/basiq
```

Create a subscription with `POST /notifications/webhooks` using the printed URL, then send a test message with `POST /notifications/messages/test`. A new subscription can take up to 15 minutes to start delivering.

## Notes

- The route uses `express.raw({ type: '*/*' })`. The signature covers the exact raw body bytes, so `express.json()` before verification breaks it.
- If `BASIQ_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- The library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so use the manual verifier in [references/verification.md](../../references/verification.md) if you need to widen or drop it.
- Payloads are thin (`eventTypeId`, `eventId`, `links`). Fetch `links.eventEntity` from the Basiq API for the data.
