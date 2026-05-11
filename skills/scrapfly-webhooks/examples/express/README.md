# Scrapfly Webhooks - Express Example

Minimal example of receiving Scrapfly webhooks with signature verification.

## Prerequisites

- Node.js 18+
- A Scrapfly account with a webhook configured (see [setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Scrapfly webhook signing secret to `.env`:
   ```bash
   SCRAPFLY_WEBHOOK_SECRET=<value-from-scrapfly-dashboard>
   ```

## Run

```bash
npm start
```

Server runs on http://localhost:3000.

## Test

```bash
npm test
```

The test suite generates valid HMAC-SHA256 signatures with the same algorithm Scrapfly uses (uppercase hex over the raw body) and asserts the endpoint accepts/rejects accordingly.

## Receive Webhooks Locally

Use the Hookdeck CLI tunnel (no install step required):

```bash
npx hookdeck-cli listen 3000 scrapfly --path /webhooks/scrapfly
```

Paste the printed public URL into your Scrapfly dashboard webhook configuration, then trigger an async Scrapfly job with `webhook_name=<your-webhook-name>&async=true`.

## Endpoint

- `POST /webhooks/scrapfly` — Receives and verifies Scrapfly webhook deliveries
- `GET /health` — Health check

## How It Works

1. The webhook body arrives as raw bytes (`express.raw({ type: '*/*' })`).
2. `verifyScrapflySignature` computes `upper(hex(HMAC_SHA256(secret, rawBody)))` and timing-safe-compares it to the `X-Scrapfly-Webhook-Signature` header.
3. If valid, the body is `JSON.parse`d and dispatched by `X-Scrapfly-Webhook-Resource-Type` (`scrape` / `extraction` / `screenshot`) or, for the Crawler API, by the `event` field in the body.
