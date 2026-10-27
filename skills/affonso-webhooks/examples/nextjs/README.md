# Affonso Webhooks - Next.js Example

Minimal example of receiving Affonso webhooks with signature verification in the App Router.

## Prerequisites

- Node.js 18+
- Affonso account with an affiliate program and a webhook endpoint (with its signing secret)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Affonso signing secret to `.env.local` (`AFFONSO_WEBHOOK_SECRET`). It is a 64-character hex string, shown once when you create the endpoint.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

The route (`app/webhooks/affonso/route.ts`) reads the raw bytes with `await request.arrayBuffer()` and verifies `X-Affonso-Signature` (lowercase hex HMAC-SHA256, no prefix) over `<X-Affonso-Timestamp>.<raw body>`, keyed with the secret as a plain string (not hex-decoded). Failures return 401. The timestamp check is off by default because retries and replays keep the original timestamp; set `AFFONSO_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 affonso --path /webhooks/affonso
```

Use the Hookdeck URL as the endpoint URL in Affonso → Settings → Webhooks → Add Endpoint, then use **Send Test Event**.
