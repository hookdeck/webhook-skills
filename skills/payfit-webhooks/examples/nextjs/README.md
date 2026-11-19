# PayFit Webhooks - Next.js Example

Minimal Next.js (App Router) example of receiving [PayFit](https://payfit.com) webhooks and verifying the Svix `svix-signature` HMAC.

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
   cp .env.example .env.local
   ```

3. Set `PAYFIT_WEBHOOK_SECRET` in `.env.local` to the endpoint's `whsec_…` signing secret. `PAYFIT_WEBHOOK_TOLERANCE_SECONDS` is optional.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/payfit` in [app/webhooks/payfit/route.ts](app/webhooks/payfit/route.ts); the verification code is in [lib/verify-payfit.ts](lib/verify-payfit.ts).

## Test

```bash
npm test
```

The tests cover Svix's published example, a valid signature, the secret used as UTF-8 text (rejected), another secret, a tampered body, a missing header, the optional timestamp window, invalid JSON, and a missing or non-base64 secret.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 payfit --path /webhooks/payfit
```

Add the printed URL as an endpoint in the PayFit webhooks dashboard, copy its signing secret, and send a test event.

## Notes

- The route reads `request.arrayBuffer()` before parsing. The HMAC covers the exact raw body, so don't call `request.json()` first.
- The key is the base64-decoded secret, not the `whsec_…` string. A secret that isn't valid base64 gets a `500`.
