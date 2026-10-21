# MaintainX Webhooks - Express Example

Minimal example of receiving MaintainX webhooks with signature verification.

## Prerequisites

- Node.js 18+
- MaintainX account with a webhook (Settings > Integrations > Webhooks) and its secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your webhook secret (Settings > Integrations > **Copy secret**) to `.env` as `MAINTAINX_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000, webhook endpoint `POST /webhooks/maintainx`.

## Test

Run the automated tests (they generate real `t=<unix>,v1=<hex>` signatures):

```bash
npm test
```

To receive real webhooks locally, start a tunnel (no account required):

```bash
npx hookdeck-cli listen 3000 maintainx --path /webhooks/maintainx
```

Use the Hookdeck URL as the webhook **Endpoint** in MaintainX, then create a work order to trigger `NEW_WORK_ORDER`.

## How Verification Works

The `x-maintainx-webhook-body-signature` header is `t=<unix>,v1=<hex>`. `v1` is HMAC-SHA256 (hex) over `{t}.{raw body}` keyed with the webhook secret. The handler uses `express.raw({ type: '*/*' })` so the body stays unparsed, compares timing-safe, and leaves the timestamp check off by default because retries and replays keep the original timestamp. Set `MAINTAINX_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds (MaintainX suggests `300`) to turn it on.
