# Axilio Webhooks - Express Example

Minimal example of receiving [Axilio](https://axilio.ai) webhooks with signature verification. Axilio signs deliveries with the Standard Webhooks scheme, so the handler verifies the `webhook-id`, `webhook-timestamp` and `webhook-signature` headers with the [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) package. If `webhook-id` is absent it reads the `svix-*` headers instead, as Hookdeck does.

## Prerequisites

- Node.js 18+
- An Axilio organization with access to **Settings > Webhooks**
- The signing secret (`whsec_...`) of your webhook destination

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put your destination's signing secret in `AXILIO_WEBHOOK_SECRET`. It is shown once when you register the destination (see [setup](../../references/setup.md)).

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/axilio`.

## Test

```bash
npm test
```

The tests sign payloads the way Axilio does (`base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{webhook-id}.{webhook-timestamp}.{raw body}"))`). They cover every documented event type, tampered bodies, stale timestamps, multiple and non-`v1` signatures, another destination's secret, the `svix-*` header fallback, retried deliveries, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 axilio --path /webhooks/axilio
```

Register the printed URL under **Settings > Webhooks > Register Destination**, then click **Test** on the destination to send an example event.

## Notes

- The route uses `express.raw({ type: '*/*' })`. The signature covers the exact raw body bytes whatever the content type, so `express.json()` before verification breaks it.
- If `AXILIO_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- The library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so late retries fail it. See [verification](../../references/verification.md) for a verifier with an adjustable window.
- Delivery is at least once. The handler dedupes on `webhook-id` (the same value as the body's `id`). Use Redis or a database in production.
- Order is not guaranteed; compare `occurred_at`. Enqueue the event and process it asynchronously in production.
