# Loop Returns Webhooks - Express Example

Minimal example of receiving Loop Returns webhooks with `X-Loop-Signature` verification.

## Prerequisites

- Node.js 18+
- A Loop Returns account with access to Developer Tools in the Loop Admin, and a webhook secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Loop webhook secret to `.env` as `LOOP_WEBHOOK_SECRET` (Loop Admin → Settings → Developer Tools)

## Run

```bash
npm start
```

Server runs on http://localhost:3000, and the webhook endpoint is `POST /webhooks/loop-returns`.

## Test

```bash
npm test
```

The tests sign payloads with Loop's algorithm, `base64(HMAC-SHA256(secret, raw body))`, and cover valid, wrong-secret, tampered, missing and wrong-length signatures, non-JSON content types, and every trigger.

## How Verification Works

1. The route uses `express.raw({ type: '*/*' })`, so the body stays a `Buffer` whatever `Content-Type` Loop sends. It doesn't parse JSON before verifying.
2. It computes `HMAC-SHA256(secret, raw body)` as **standard base64** and compares it to `X-Loop-Signature` with `crypto.timingSafeEqual`.
3. Only after verification does it parse the JSON and dispatch on `payload.trigger`.

Handled triggers: `return.created`, `return.updated`, `return.closed`, `return.processing.failed`, `label.created`, `label.updated`, `restock.requested`, `giftcard.requested`, `shipment.processed`.

## Local Testing with Hookdeck

Use the Hookdeck CLI to receive webhooks locally (no account required):

```bash
npx hookdeck-cli listen 3000 loop-returns --path /webhooks/loop-returns
```

Add the printed URL as a webhook in the Loop Admin under **Settings → Developer Tools**, pick a topic and trigger, and use a test return to send a payload.
