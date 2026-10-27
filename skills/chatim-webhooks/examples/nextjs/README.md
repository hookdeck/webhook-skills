# Chatim Webhooks - Next.js Example

Minimal example of receiving Chatim webhooks with signature verification, using the App Router.

## Prerequisites

- Node.js 18+
- Chatim account with a project webhook and its secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Chatim webhook secret to `.env.local` (`CHATIM_WEBHOOK_SECRET`). Chatim shows it once, when you create the webhook.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

The route (`app/webhooks/chatim/route.ts`) reads the raw bytes with `await request.arrayBuffer()` and verifies `X-Chatim-Signature` (`sha256=<hex>`): HMAC-SHA256 of `<X-Chatim-Timestamp>.<raw body>`. A bad signature gets `401`. The timestamp check is off by default because retries and replays keep the original timestamp; set `CHATIM_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 chatim --path /webhooks/chatim
```

Use the Hookdeck URL as the webhook URL in Chatim → your project → Webhooks, then click **Test** to send a sample `chat.started` event.
