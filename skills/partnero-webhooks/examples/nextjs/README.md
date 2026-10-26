# Partnero Webhooks - Next.js Example

Minimal example of receiving Partnero webhooks with signature verification (App Router).

## Prerequisites

- Node.js 18+
- A Partnero program with an outgoing webhook (and its signing secret)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```
3. Add your webhook's signing secret (Program Settings > Webhooks) to `.env.local`

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
npx hookdeck-cli listen 3000 partnero --path /webhooks/partnero
```

Then use the Hookdeck URL as the webhook URL in Partnero (Program Settings > Webhooks > Add Webhook).
The route reads `await request.arrayBuffer()` so the exact bytes are verified before the JSON is parsed.
