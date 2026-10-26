# Bayou Energy Webhooks - Express Example

Minimal example of receiving [Bayou Energy](https://www.bayou.energy) webhooks with signature verification. Bayou signs deliveries per the Standard Webhooks spec, so the handler verifies the `webhook-id`, `webhook-timestamp` and `webhook-signature` headers with the [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) package.

## Prerequisites

- Node.js 18+
- A Bayou Energy company account
- The company's signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put your signing secret, including the `whsec_` prefix, in `BAYOU_ENERGY_WEBHOOK_SECRET`. Find it in the Bayou dashboard under **Settings**, below the Webhook URL (see [setup](../../references/setup.md)).

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/bayou-energy`.

## Test

```bash
npm test
```

The tests sign payloads the way Bayou does (`base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{webhook-id}.{webhook-timestamp}.{raw body}"))`), including the test vector from Bayou's docs. They cover tampered bodies, stale timestamps, multiple signatures, another secret, retried deliveries, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 bayou-energy --path /webhooks/bayou-energy
```

Paste the printed URL into the **Webhook URL** field in the Bayou dashboard settings.

## Notes

- The route uses `express.raw({ type: '*/*' })`. The signature covers the exact raw body bytes, so `express.json()` before verification breaks it. The body is parsed only after the check.
- The `standardwebhooks` library rejects timestamps more than 5 minutes off. Hookdeck retries and replays resend the original timestamp, so use the manual verifier in [verification.md](../../references/verification.md) if you need to drop or widen the window.
- If `BAYOU_ENERGY_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- Bayou payloads have no event ID. The handler dedupes on the `webhook-id` header.
