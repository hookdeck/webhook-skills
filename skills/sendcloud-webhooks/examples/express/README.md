# Sendcloud Webhooks - Express Example

Minimal example of receiving [Sendcloud](https://www.sendcloud.com) webhooks with `Sendcloud-Signature` (HMAC-SHA256) verification. The route reads the raw body with `express.raw({ type: '*/*' })` so any content type verifies.

## Prerequisites

- Node.js 18+
- A Sendcloud API integration and its Secret Key or Webhook Signature Key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put your integration's Secret Key or Webhook Signature Key in `SENDCLOUD_WEBHOOK_SECRET`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/sendcloud`.

## Test

```bash
npm test
```

The tests sign bodies with HMAC-SHA256 (including the docs test vector) and cover tampering, wrong secrets, missing headers and non-JSON content types.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 sendcloud --path /webhooks/sendcloud
```

Set the printed URL as **Webhook url** in **Settings > Integrations**, then click **Test API webhook**.
