# Lodgix Webhooks - Next.js Example

Minimal example of receiving Lodgix webhooks with `X-Lodgix-Signature` verification.

## Prerequisites

- Node.js 18+
- A Lodgix account with a webhook endpoint (Modules > Integrations > Webhooks) and its secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Lodgix endpoint secret to `.env` as `LODGIX_WEBHOOK_SECRET`. Optionally set
   `LODGIX_WEBHOOK_TOLERANCE_SECONDS` (for example `300`) to enable a replay window; it is
   off by default because Hookdeck retries and replays keep the original timestamp.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

Run the test suite (generates real HMAC-SHA256 signatures over `{timestamp}.{raw body}`):

```bash
npm test
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 3000 lodgix --path /webhooks/lodgix
```

Use the Hookdeck-provided URL as the **Endpoint URL** of your Lodgix webhook, then trigger a
`message.received` event by receiving a guest message.

## Endpoint

- `POST /webhooks/lodgix` (`app/webhooks/lodgix/route.ts`) - Receives and verifies Lodgix webhooks (the body is read with
  `await request.arrayBuffer()` so the exact bytes are verified)
