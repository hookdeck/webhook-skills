# Lettermint Webhooks - Express Example

Minimal example of receiving Lettermint webhooks with `X-Lettermint-Signature` verification.

## Prerequisites

- Node.js 18+
- A Lettermint account with a webhook (Dashboard → Webhooks) and its signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Lettermint webhook secret to `.env` as `LETTERMINT_WEBHOOK_SECRET`. Paste the whole secret, including the whsec_ prefix. Lettermint uses it as a plain HMAC key.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/lettermint`.

## Test

Run the tests (they generate real HMAC-SHA256 signatures):

```bash
npm test
```

## Receive real webhooks locally

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 lettermint --path /webhooks/lettermint
```

Use the tunnel URL as the webhook **URL** in the Lettermint dashboard, then click **Test Webhook** on the webhook's details page.

## How verification works

The `X-Lettermint-Signature` header is `t=<unix>,v1=<hex>`. The handler reads the raw body with `express.raw({ type: '*/*' })`, computes `hex(HMAC-SHA256(secret, "<t>.<rawBody>"))` over bytes with the whole secret (including `whsec_`) as the key, and compares it timing-safely with every `v1` (any match passes). Missing or invalid signatures return `401`. The timestamp check is off by default, because retries and Hookdeck replays keep the original `t`; set `LETTERMINT_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds (Lettermint's SDKs use `300`) to turn it on. See [../../references/verification.md](../../references/verification.md).
