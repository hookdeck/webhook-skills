# Sendcloud Webhooks - Next.js Example

Minimal Next.js App Router example of receiving [Sendcloud](https://www.sendcloud.com) webhooks with `Sendcloud-Signature` (HMAC-SHA256) verification. The route reads the raw bytes with `request.arrayBuffer()` so any content type verifies.

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
   cp .env.example .env.local
   ```

3. Put your integration's Secret Key or Webhook Signature Key in `SENDCLOUD_WEBHOOK_SECRET`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/sendcloud` ([app/webhooks/sendcloud/route.ts](app/webhooks/sendcloud/route.ts)).

## Test

```bash
npm test
```

The tests call the route handler directly with real HMAC-SHA256 signatures (including the docs test vector) and cover tampering, wrong secrets, missing headers, non-JSON content types and the fail-closed path.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 sendcloud --path /webhooks/sendcloud
```

Set the printed URL as **Webhook url** in **Settings > Integrations**, then click **Test API webhook**.
