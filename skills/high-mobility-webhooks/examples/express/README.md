# High Mobility Webhooks - Express Example

Minimal example of receiving High Mobility webhooks with `X-HM-Signature-256` verification.

## Prerequisites

- Node.js 18+
- High Mobility app with a webhook configured (URL, secret, events)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the webhook secret you entered in the High Mobility console to `.env` (`HIGH_MOBILITY_WEBHOOK_SECRET`)

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and the webhook route is `/webhooks/high-mobility`.

The route accepts GET, POST, PUT, PATCH and DELETE, because High Mobility's docs don't name the method (Hookdeck's High Mobility source pre-selects POST without managing the method). It reads the raw body with `express.raw({ type: '*/*' })`, checks `sha256=` + hex HMAC-SHA256 of the exact bytes, and treats a missing body as zero bytes. Failures return 401; a verified request with no body returns 200.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 high-mobility --path /webhooks/high-mobility
```

Use the Hookdeck URL as the webhook URL in the High Mobility console; saving the configuration sends a signed `ping`.
