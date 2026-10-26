# RocketReach Webhooks - Express Example

Minimal example of receiving RocketReach lookup webhooks with `X-RocketReach-Signature` HMAC verification.

## Prerequisites

- Node.js 18+
- A RocketReach webhook with a secret generated (API Usage & Settings > Generate Secret)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put your webhook secret in `.env` as `ROCKETREACH_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000, endpoint `POST /webhooks/rocketreach`.

The route uses `express.raw({ type: '*/*' })` so the signature is checked against the raw
bytes whatever the content type.

## Receive webhooks locally

```bash
npx hookdeck-cli listen 3000 rocketreach --path /webhooks/rocketreach
```

Use the URL it prints as the webhook URL on the RocketReach API Usage & Settings page, then
click **Test Webhook**.

## Test

```bash
npm test
```

The tests sign payloads the way RocketReach does (base64 HMAC-SHA256 of the raw body).
