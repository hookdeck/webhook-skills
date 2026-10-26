# Ziina Webhooks - Express Example

Minimal example of receiving Ziina webhooks with `X-Hmac-Signature` verification.

## Prerequisites

- Node.js 18+
- A Ziina account. Set a secret when you register the webhook through the Ziina API. Without one, deliveries are unsigned and fail verification.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put the `secret` you gave to `POST /webhook` in `.env` as `ZIINA_WEBHOOK_SECRET`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000, webhook route `POST /webhooks/ziina`.

## Test

```bash
npm test
```

To receive real deliveries locally:

```bash
npx hookdeck-cli listen 3000 ziina --path /webhooks/ziina
```

Register the Hookdeck URL with `POST /webhook` (with your secret), then trigger a payment intent or refund.

## Notes

- The route uses `express.raw({ type: '*/*' })` so the exact bytes are verified; JSON is parsed after the check.
- Missing, malformed or mismatching signature returns `401`.
