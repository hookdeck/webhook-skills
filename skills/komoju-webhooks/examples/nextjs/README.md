# KOMOJU Webhooks - Next.js Example (App Router)

Minimal example of receiving KOMOJU webhooks with signature verification.

## Prerequisites

- Node.js 18+
- A KOMOJU account with a webhook that has a secret token set (Manage > Webhooks)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```
3. Add the webhook's secret token to `.env.local` as `KOMOJU_WEBHOOK_SECRET`. Set a secret token on the KOMOJU webhook. Without one, deliveries are unsigned and fail verification.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 komoju --path /webhooks/komoju
```

Then add the Hookdeck URL as the webhook URL in KOMOJU (Manage > Webhooks). The handler reads `await request.arrayBuffer()` so the exact bytes are verified against `X-Komoju-Signature` before the JSON is parsed, and dedupes on the event `id`.
