# Khipu Webhooks - Express Example

Minimal example of receiving Khipu webhooks with signature verification.

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
   cp .env.example .env
   ```

3. Add your Khipu merchant secret to `.env` (`KHIPU_WEBHOOK_SECRET`).

## Run

```bash
npm start
```

Server runs on http://localhost:3000

The handler reads the raw body with `express.raw({ type: '*/*' })` and verifies `x-khipu-signature` (`t=<unix ms>,s=<base64>`): base64 HMAC-SHA256 of `<t>.<raw body>`, keyed with the merchant secret. A bad or missing signature gets `401`. The timestamp check is off by default because retries and replays keep the original timestamp; set `KHIPU_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

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
