# Vitable Health Webhooks - Express Example

Minimal example of receiving Vitable Health webhooks with signature verification.

## Prerequisites

- Node.js 18+
- A Vitable Health webhook subscription and its secret key (Vitable's team provides it on request)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your subscription's secret key to `.env` (`VITABLE_WEBHOOK_SECRET`)

## Run

```bash
npm start
```

Server runs on http://localhost:3000

Vitable signs `<X-Vitable-Timestamp>.<raw body>` with HMAC-SHA512 and sends `X-Vitable-Signature: sha512=<hex>`. There is no SDK, so the handler verifies manually. The route reads the body with `express.raw({ type: '*/*' })`, so any content type verifies, and parses JSON only after the check. Failures return `401`. Duplicate deliveries are skipped by `event_id`. The timestamp check is off by default because retries and replays keep the original timestamp; set `VITABLE_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds (Vitable's examples use 300) to reject older ones.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 vitable-health --path /webhooks/vitable-health
```

Give the Hookdeck URL to Vitable as your webhook endpoint.
