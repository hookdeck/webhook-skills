# Coassemble Webhooks - Next.js Example

Minimal example of receiving Coassemble webhooks with signature verification, using the App Router.

## Prerequisites

- Node.js 18+
- Coassemble workspace (Build plan or above) with a webhook endpoint and its signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Coassemble webhook secret to `.env.local` (`COASSEMBLE_WEBHOOK_SECRET`). Coassemble returns it once, when you create the endpoint.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

The route (`app/webhooks/coassemble/route.ts`) reads the raw bytes with `await request.arrayBuffer()` and verifies `X-Coassemble-Signature` (`sha256=<hex>`): HMAC-SHA256 of `<X-Coassemble-Timestamp>.<raw body>`. A bad signature gets `401`. The timestamp check is off by default because retries and replays keep the original timestamp; set `COASSEMBLE_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 coassemble --path /webhooks/coassemble
```

Use the Hookdeck URL as the webhook URL in Coassemble → Developer → Webhooks, then click **Test** to send a sample event (`testMode: true`).
