# BoldSign Webhooks - Express Example

Minimal example of receiving BoldSign webhooks with signature verification.

## Prerequisites

- Node.js 18+
- BoldSign account with a webhook and its signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your BoldSign webhook signing secret to `.env` (`BOLDSIGN_WEBHOOK_SECRET`). Reveal it on the webhook's overview page.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

The handler reads the raw body with `express.raw({ type: '*/*' })` and verifies `X-BoldSign-Signature` (`t=<unix seconds>, s0=<hex>`, plus `s1` during a secret rollover): HMAC-SHA256 of `<t>.<raw body>`. The setup `Verification` POST gets a 200 straight away. The timestamp check is off by default because retries and replays keep the original timestamp; set `BOLDSIGN_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 boldsign --path /webhooks/boldsign
```

Use the Hookdeck URL as the webhook URL in BoldSign → API → Webhooks → Add Webhook, then click **Verify** (BoldSign sends a `Verification` event and expects a 200 within 10 seconds).
