# Cashfree Webhooks - Express Example

Minimal example of receiving [Cashfree](https://www.cashfree.com) webhooks (Payment Gateway, Payouts V2, Secure ID, PPI) with manual signature verification: base64 HMAC-SHA256 of the `x-webhook-timestamp` header value followed by the raw body.

## Prerequisites

- Node.js 18+
- A Cashfree merchant account and its client secret (Partner API key for partner webhooks)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put your Cashfree client secret in `CASHFREE_WEBHOOK_SECRET`. Legacy Payouts V1 and Cashgram webhooks use another scheme and fail verification.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/cashfree`.

## Test

```bash
npm test
```

The tests sign payloads the way Cashfree does (`base64(HMAC-SHA256(secret, timestamp + rawBody))`). They cover each product's event field (`type` vs `event_type`), pretty-printed raw bodies, tampered bodies and timestamps, malformed or wrong-case signatures, missing headers, the opt-in tolerance, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 cashfree --path /webhooks/cashfree
```

Add the printed URL as a webhook endpoint in the Cashfree Merchant Dashboard.

## Notes

- The route uses `express.raw({ type: '*/*' })`. The signature covers the exact body bytes, so `express.json()` before verification breaks it.
- Cashfree treats anything other than HTTP 200 as a failure, so valid deliveries answer `200`. Bad signatures get `401`.
- Old timestamps are accepted by default, because retries and replays resend the original timestamp. Set `CASHFREE_WEBHOOK_TOLERANCE_SECONDS` to opt in (the timestamp unit is not documented; check a real delivery).
- Without `CASHFREE_WEBHOOK_SECRET` the handler returns `500` and never accepts unverified requests.
