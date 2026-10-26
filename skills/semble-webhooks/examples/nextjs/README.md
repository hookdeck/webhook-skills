# Semble Webhooks - Next.js Example

Minimal example of receiving Semble webhooks with `X-Webhook-Signature` verification.

## Prerequisites

- Node.js 18+
- Semble account with webhooks enabled for your practice and an API token that can create webhooks, so you can call `createWebhook` and get the `secret`

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the subscription's `secret` to `.env` (`SEMBLE_WEBHOOK_SECRET`). The `createWebhook` mutation returns it.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

The handler reads the raw body with `request.text()`, verifies `X-Webhook-Signature` (`t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`), then dispatches on the body's `eventType` (for example `booking.created`). The timestamp check is off by default because retries and replays keep the original timestamp; set `SEMBLE_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 semble --path /webhooks/semble
```

Use the Hookdeck URL as the `url` in the `createWebhook` mutation, then trigger an event (for example create a booking in Semble) to see a delivery.
