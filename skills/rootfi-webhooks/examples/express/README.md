# RootFi (Commenda) Webhooks - Express Example

Minimal example of receiving RootFi webhooks with `X-RootFi-Signature` verification.

## Prerequisites

- Node.js 18+
- A RootFi (Commenda integrations) account and a webhook config with a `signing_key`

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set a `signing_key` on the RootFi webhook config. Without one, deliveries are unsigned and fail verification. Put the same string in `.env` as `ROOTFI_WEBHOOK_SECRET`. RootFi does not generate the key: choose a long random string. It is used as-is (UTF-8) as the HMAC key.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

The handler reads the raw body with `express.raw({ type: '*/*' })`, verifies `X-RootFi-Signature` (`t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`), then dispatches on the body's `event` field (`DATA_MODEL_CHANGES`, `SYNC_STARTED`, `SYNC_COMPLETED`, `CONNECTION_CHANGED`, `DISCONNECT_REQUESTED`). Failed verification returns 401. The timestamp check is off by default because retries and replays keep the original timestamp; set `ROOTFI_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 rootfi --path /webhooks/rootfi
```

Use the Hookdeck URL as the `url` of the webhook config (`POST /v4/core/webhook-config`, or Webhooks > Create Webhook in the dashboard). Each config subscribes to exactly one event type, so create one per event you want.
