# Speed Webhooks - Express Example

Minimal example of receiving [Speed](https://www.tryspeed.com) webhooks with signature verification. Speed signs deliveries in the [Standard Webhooks](https://www.standardwebhooks.com) layout, so the handler verifies the `webhook-id`, `webhook-timestamp` and `webhook-signature` headers with the [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) package. If `webhook-id` is absent it reads the `svix-*` headers instead, as Hookdeck does. Speed's secret starts with `wsec_`, which the handler turns into `whsec_` before giving it to the library.

## Prerequisites

- Node.js 18+
- A Speed account with a webhook endpoint, and its signing secret (`wsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put your endpoint's signing secret in `SPEED_WEBHOOK_SECRET`, exactly as Speed shows it (with the `wsec_` prefix). Reveal it under **Developers > Webhooks** (see [setup](../../references/setup.md)).

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/speed`.

## Test

```bash
npm test
```

The tests sign payloads the way Speed does (`base64(HMAC-SHA256(base64decode(secret after "wsec_"), "{webhook-id}.{webhook-timestamp}.{raw body}"))`). They cover payment, checkout session, withdrawal and Connect events, tampered bodies, stale timestamps, multiple signatures, another endpoint's secret, retried deliveries, deliveries sent with `svix-*` headers, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 speed --path /webhooks/speed
```

Register the printed URL as an endpoint under **Developers > Webhooks**, subscribe to events such as `payment.paid`, then trigger one (or retry a message from the dashboard).

## Notes

- The route uses `express.raw({ type: '*/*' })`. The signature covers the exact raw body bytes for any content type, so `express.json()` before verification breaks it.
- If `SPEED_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- The `standardwebhooks` library always enforces a 5-minute timestamp window. A retry or replay through Hookdeck keeps its original timestamp and is rejected once it is more than 5 minutes old. See [verification.md](../../references/verification.md) for a manual verifier where the window can be dropped.
- Speed re-signs each retry with a new `webhook-id`, so the handler dedupes on the event `id` (`evt_…`), which stays the same. Compare `modified` before overwriting newer data.
- Reply `2xx` quickly: any other status is retried. Enqueue the event and process it asynchronously in production.
