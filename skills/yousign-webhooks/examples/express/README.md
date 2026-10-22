# Yousign Webhooks - Express Example

Minimal example of receiving Yousign webhooks with signature verification (`X-Yousign-Signature-256`, HMAC-SHA256 of the raw body).

## Prerequisites

- Node.js 18+
- Yousign account with a webhook subscription (its secret key)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your webhook subscription secret to `.env` as `YOUSIGN_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000, endpoint `POST /webhooks/yousign`.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 yousign --path /webhooks/yousign
```

Use the Hookdeck URL as the endpoint of your Yousign webhook subscription (sandbox is fine for testing).

## Test

```bash
npm test
```

Tests generate real `sha256=<hex>` signatures for `signature_request.activated`, `signature_request.done`, `signature_request.declined`, `signer.done` and `signer.declined`.
