# Convox Webhooks - Next.js Example

Minimal example of receiving Convox webhooks with `Convox-Signature` verification (App Router).

## Prerequisites

- Node.js 18+
- A Convox Rack on 3.24.6 or later with the `webhook_signing_key` Rack parameter set

> Signing is opt-in: set the webhook_signing_key rack parameter (Rack 3.24.6 or later) and paste the same value. Without it, deliveries are unsigned and fail verification.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your signing key to `.env.local` as `CONVOX_WEBHOOK_SECRET`. Use it exactly as you set it on the Rack; don't hex-decode it.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and the webhook route is `/webhooks/convox`.

The route reads the raw bytes with `await request.arrayBuffer()` and checks any `v1` entry in `Convox-Signature` against the hex HMAC-SHA256 of `<t>.<raw body>`. The timestamp check is off by default because retries and replays keep the original timestamp; set `CONVOX_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 convox --path /webhooks/convox
```

Use the Hookdeck URL as the webhook URL in Console under App > Settings > Webhooks.
