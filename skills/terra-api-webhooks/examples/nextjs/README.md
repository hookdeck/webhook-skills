# Terra API Webhooks - Next.js Example

Minimal example of receiving Terra API webhooks with signature verification.

## Prerequisites

- Node.js 18+
- Terra account with a webhook destination and its signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Terra signing secret to `.env` (`TERRA_WEBHOOK_SECRET`). It is shown on the Connections page of the Terra dashboard.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

The handler reads the raw body with `await request.arrayBuffer()` and verifies the `terra-signature` header (`t=<unix seconds>,v1=<hex>`): HMAC-SHA256 of `<t>.<raw body>`. A missing, malformed or non-matching signature gets a `401`. The timestamp check is off by default because retries and replays keep the original timestamp; set `TERRA_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones. Events are dispatched on the body's `type` field.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 terra-api --path /webhooks/terra-api
```

Use the Hookdeck URL as the webhook URL of your destination in the Terra dashboard. Terra expects a 2xx within 8 seconds.
