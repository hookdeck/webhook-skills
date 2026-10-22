# Luma Webhooks - Express Example

Minimal example of receiving Luma (lu.ma events platform) webhooks with `Webhook-Signature` verification.

## Prerequisites

- Node.js 18+
- A Luma Plus subscription and a calendar where you can create webhooks

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Luma webhook secret (`whsec_...`, shown when the webhook is created) to `.env` as `LUMA_WEBHOOK_SECRET`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/luma`.

## Test

Run the tests (they generate real HMAC-SHA256 signatures):

```bash
npm test
```

## Receive real webhooks locally

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 luma --path /webhooks/luma
```

Use the tunnel URL as the webhook URL under **Settings → Developer → Webhooks** in your Luma calendar, then trigger an event (for example, register a test guest).

## How verification works

The `Webhook-Signature` header is `t=<unix>,v1=<hex>`. The handler reads the raw body with `express.raw({ type: '*/*' })` so any content type verifies, computes `hex(HMAC-SHA256(secret, "<t>.<rawBody>"))` with the whole `whsec_...` secret as a UTF-8 key, and compares it timing-safely with `v1`. This is not Standard Webhooks, so don't strip or base64-decode the secret. The timestamp check is off by default, because Hookdeck's retries and replays keep the original `t`; set `LUMA_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to turn it on. See [../../references/verification.md](../../references/verification.md).
