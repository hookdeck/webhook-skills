# MongoDB Atlas Webhooks - Next.js Example

Minimal example of receiving MongoDB Atlas alert webhooks with `X-MMS-Signature` verification.

## Prerequisites

- Node.js 18+
- A MongoDB Atlas project with a **Webhook Secret** set under Project Settings → Integrations → Webhook Settings

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Atlas Webhook Secret to `.env` as `MONGODB_ATLAS_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 mongodb-atlas --path /webhooks/mongodb-atlas
```

Use the printed URL as the **Webhook URL** in Atlas, then trigger a temporary alert (Atlas has no test button).

### Send a signed request by hand

```bash
BODY='{"id":"5d1b6f8e8c2e4e2d3c4a5b6c","eventTypeName":"HOST_DOWN","status":"OPEN"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha1 -hmac "$MONGODB_ATLAS_WEBHOOK_SECRET" -binary | base64)
curl -X POST http://localhost:3000/webhooks/mongodb-atlas \
  -H 'Content-Type: application/json' -H 'X-MMS-Event: alert.open' -H "X-MMS-Signature: $SIG" -d "$BODY"
```

### Run tests

```bash
npm test
```

## Endpoint

- `POST /webhooks/mongodb-atlas` (`app/webhooks/mongodb-atlas/route.ts`) - Receives and verifies Atlas alerts (`OUTSIDE_METRIC_THRESHOLD`, `HOST_DOWN`; other `eventTypeName` values are logged)
