# OxaPay Webhooks - Next.js Example

Minimal example of receiving OxaPay callbacks with signature verification.

## Prerequisites

- Node.js 18+
- An OxaPay account: your merchant API key (payment callbacks) or payout API key (payout callbacks)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the API key to `.env` as `OXAPAY_WEBHOOK_SECRET`. Payment callbacks are signed with the merchant API key and payout callbacks with the payout API key, so run one deployment (or one Hookdeck source) per key.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000, endpoint `POST /webhooks/oxapay`.

## Receive callbacks locally

OxaPay does not call private networks such as localhost, so use a tunnel:

```bash
npx hookdeck-cli listen 3000 oxapay --path /webhooks/oxapay
```

Use the URL it prints as the `callback_url` of your OxaPay request. If you receive through a Hookdeck source, set the source's custom response to `ok`.

## Test

```bash
npm test
```

The tests sign bodies with HMAC-SHA512 (hex) exactly as OxaPay does. The handler answers verified callbacks with `200` and the plain-text body `ok`, which OxaPay requires to treat a delivery as successful; a bad signature gets `401`.
