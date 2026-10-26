# Khipu Webhooks - Next.js Example

Minimal example of receiving Khipu webhooks with signature verification (App Router).

## Prerequisites

- Node.js 18+
- Khipu collecting account and its merchant secret

> Only notifications API version 3.0 is supported. Version 1.3 notifications aren't signed this way and fail verification.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Khipu merchant secret to `.env.local` (`KHIPU_WEBHOOK_SECRET`).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. The route is `app/webhooks/khipu/route.ts`.

It reads the raw bytes with `await request.arrayBuffer()` and verifies `x-khipu-signature` (`t=<unix ms>,s=<base64>`): base64 HMAC-SHA256 of `<t>.<raw body>`, keyed with the merchant secret. A bad or missing signature gets `401`. The timestamp check is off by default because retries and replays keep the original timestamp; set `KHIPU_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
npm test
```

The tests include the worked example published in Khipu's docs.

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 khipu --path /webhooks/khipu
```

Use the Hookdeck URL as `notify_url` (with `notify_api_version` `"3.0"`) when creating a Khipu collection.
