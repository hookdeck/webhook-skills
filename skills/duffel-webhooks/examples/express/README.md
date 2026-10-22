# Duffel Webhooks - Express Example

Minimal example of receiving Duffel webhooks with `X-Duffel-Signature` verification.

## Prerequisites

- Node.js 18+
- Duffel account with a webhook created via the API (its `secret` is returned once)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Duffel webhook secret to `.env` (`DUFFEL_WEBHOOK_SECRET`). Use it exactly as returned; don't base64-decode it.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

The handler reads the raw body with `express.raw({ type: '*/*' })` and checks `v1` = HMAC-SHA256 (hex) of `<t>.<raw body>`. The timestamp check is off by default because retries and replays keep the original timestamp; set `DUFFEL_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 duffel --path /webhooks/duffel
```

Use the Hookdeck URL as the `url` when creating the webhook, then trigger a `ping.triggered` event with `POST /air/webhooks/id/{id}/actions/ping`.
