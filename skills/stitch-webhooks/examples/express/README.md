# Stitch Webhooks - Express Example

Minimal example of receiving Stitch (stitch.money) webhooks with Svix signature
verification, using the official [`svix`](https://www.npmjs.com/package/svix) library.

## Prerequisites

- Node.js 18+ (the example uses ES modules because `svix` 2.x is ESM-only)
- A Stitch webhook subscription and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your subscription's signing secret to `.env` as `STITCH_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/stitch
```

## Test

```bash
npm test
```

The tests sign payloads with the same HMAC-SHA256 scheme Svix uses and cover
every Stitch event type, signature lists with `v2` / rotated entries, invalid
signatures, tampered bodies, and stale timestamps.

## Local Testing with Hookdeck

Receive real Stitch webhooks locally (no account required):

```bash
npx hookdeck-cli listen 3000 stitch --path /webhooks/stitch
```

Use the printed URL as the `url` when you create the subscription
(`clientWebhookAdd`) or add an endpoint in the Svix portal. From the Svix portal
you can then resend messages from **Logs** to your tunnel.
