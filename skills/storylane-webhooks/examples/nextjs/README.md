# Storylane Webhooks - Next.js Example

Minimal example of receiving Storylane demo alert webhooks with signature verification (App Router).

## Prerequisites

- Node.js 18+
- A Storylane account (Starter plan or above) with a webhook Verification Secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```
3. Add your Webhook Verification Secret to `.env.local`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and the endpoint is `/webhooks/storylane`.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 storylane --path /webhooks/storylane
```

Then set the Hookdeck URL as the webhook URL in Storylane (Settings > Alerts) and use the
**Test webhook** button. The route reads `request.arrayBuffer()` (the raw bytes) before parsing
the JSON.
