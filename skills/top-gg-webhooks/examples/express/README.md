# Top.gg Webhooks - Express Example

Minimal example of receiving Top.gg (top.gg) vote webhooks with `x-topgg-signature` verification.

## Prerequisites

- Node.js 18+
- A Top.gg project (bot or server) with a v1 webhook configured in its dashboard

Only v1 webhooks, whose secret starts with whs_, are supported. Legacy v0 webhooks aren't signed and fail verification.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your webhook secret (`whs_...`, generated when you save the webhook URL under your project's **Webhooks** page) to `.env` as `TOP_GG_WEBHOOK_SECRET`. Use the whole string, prefix included.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/top-gg`.

## Test

Run the tests (they generate real HMAC-SHA256 signatures):

```bash
npm test
```

## Receive real webhooks locally

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 top-gg --path /webhooks/top-gg
```

Paste the tunnel URL into your project's **Webhooks** page, then use the dashboard's test button to send a `webhook.test` event.

## How verification works

The `x-topgg-signature` header is `t=<unix>,v1=<hex>`. The handler reads the raw bytes with `express.raw({ type: '*/*' })`, computes `hex(HMAC-SHA256(secret, "<t>.<raw body bytes>"))` with the `whs_` secret used whole as UTF-8 key bytes, and compares it timing-safely against every `v1` entry (each must be exactly 64 hex characters). Missing, malformed or mismatched signatures get `401`. The timestamp check is off by default, because Hookdeck retries and replays keep the original `t`. Set `TOP_GG_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds to turn it on. See [../../references/verification.md](../../references/verification.md).
