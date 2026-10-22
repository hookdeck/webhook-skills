# Truework Webhooks - Express Example

Minimal example of receiving Truework webhooks (`order.completed`, `verification_request.state.change`) in Express.

> **There is no signature to verify.** Truework does not sign the payload. Each webhook has an authentication token that Truework sends raw in the `X-Truework-Token` header; this example compares it with `TRUEWORK_WEBHOOK_TOKEN` in constant time. See [references/verification.md](../../references/verification.md).

## What this example shows

- `POST /webhooks/truework` reading the body with `express.raw({ type: '*/*' })` so any content type is handled and nothing is parsed before authentication
- Constant-time comparison of `X-Truework-Token` (both sides hashed with SHA-256 so `crypto.timingSafeEqual` never sees unequal lengths)
- **Fail closed:** `500` when `TRUEWORK_WEBHOOK_TOKEN` is unset, `401` on a missing or wrong token
- Dispatch on `hook.event`: `order.completed` and `verification_request.state.change`

## Prerequisites

- Node.js 18+
- A Truework service account with a webhook configured (Developer Settings)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `TRUEWORK_WEBHOOK_TOKEN` to the token shown for your webhook under Developer Settings > Webhooks. A recreated webhook gets a new token.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

Send a request by hand:

```bash
curl -X POST http://localhost:3000/webhooks/truework \
  -H "Content-Type: application/json" \
  -H "X-Truework-Token: $TRUEWORK_WEBHOOK_TOKEN" \
  -d '{"version":"2023-10-30","hook":{"id":1,"event":"order.completed","target":"http://localhost:3000/webhooks/truework"},"data":{"order_id":"ord_123"}}'
```

### Receive webhooks locally

```bash
npx hookdeck-cli listen 3000 truework --path /webhooks/truework
```

No account required. Use the printed public URL as the webhook URL in Truework's Developer Settings.

## Endpoint

- `POST /webhooks/truework`: `500` if no token is configured, `401` on a missing or wrong token, `400` on malformed JSON, `200` otherwise. Failed deliveries are retried for up to 48 hours.
- `GET /health`: health check.
