# Zoho Sign Webhooks - Express Example

Minimal example of receiving Zoho Sign webhooks with `X-ZS-WEBHOOK-SIGNATURE` HMAC verification.

## Prerequisites

- Node.js 18+
- A Zoho Sign webhook with the HMAC signature checkbox enabled and its secret key saved

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put your webhook secret key in `.env` as `ZOHO_SIGN_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000, endpoint `POST /webhooks/zoho-sign`.

The route uses `express.raw({ type: '*/*' })` so the signature is checked against the raw
bytes whatever the content type.

## Receive webhooks locally

```bash
npx hookdeck-cli listen 3000 zoho-sign --path /webhooks/zoho-sign
```

Use the URL it prints as the callback URL in Zoho Sign (Settings > Developer Settings > Webhooks).

## Test

```bash
npm test
```

The tests sign payloads the way Zoho Sign does and also check the sample from Zoho's docs.
