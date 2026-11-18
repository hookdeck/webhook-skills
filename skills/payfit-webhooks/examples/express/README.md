# PayFit Webhooks - Express Example

Minimal Express example of receiving [PayFit](https://payfit.com) webhooks and verifying the Svix `svix-signature` HMAC.

## Prerequisites

- Node.js 18+
- PayFit partner credentials with webhook access enabled (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `PAYFIT_WEBHOOK_SECRET` in `.env` to the endpoint's `whsec_…` signing secret. `PAYFIT_WEBHOOK_TOLERANCE_SECONDS` is optional.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/payfit` in [src/index.js](src/index.js).

## Test

```bash
npm test
```

The tests cover Svix's published example, several `v1` entries during a rotation, the optional timestamp window, a valid signature, an integration event, the secret used as UTF-8 text (rejected), the secret without `whsec_`, another secret, a tampered body, each missing header, an old timestamp with the window on, invalid JSON, and a missing or non-base64 secret.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 payfit --path /webhooks/payfit
```

Add the printed URL as an endpoint in the PayFit webhooks dashboard, copy its signing secret, and send a test event.

## Notes

- The route uses `express.raw({ type: '*/*' })`. The HMAC covers the exact raw body, so `express.json()` on this route breaks it.
- The key is the base64-decoded secret, not the `whsec_…` string. A secret that isn't valid base64 gets a `500`.
