# Partnero Webhooks - Express Example

Minimal example of receiving Partnero webhooks with signature verification.

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
   cp .env.example .env
   ```
3. Add your webhook's signing secret (Program Settings > Webhooks) to `.env`

## Run

```bash
npm start
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
The handler reads the body with `express.raw({ type: '*/*' })`, so the exact bytes are verified
before the JSON is parsed.
