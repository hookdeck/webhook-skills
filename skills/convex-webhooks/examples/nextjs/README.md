# Convex Webhooks - Next.js Example

Minimal example of receiving Convex webhook log stream events with signature verification (`x-webhook-signature`, `sha256=<hex>` HMAC-SHA256 of the raw body).

## Prerequisites

- Node.js 18+
- Convex deployment on a Pro plan (log streams require Pro) with a webhook log stream

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the HMAC secret shown in the Convex dashboard when you configure the webhook log stream to `.env` as `CONVEX_WEBHOOK_SECRET`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000, endpoint `POST /webhooks/convex` (Next.js route: `app/webhooks/convex/route.ts`).

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 convex --path /webhooks/convex
```

Use the Hookdeck URL as the webhook URL of your Convex log stream (Deployment Settings > Integrations). Convex sends a `verification` event when the stream is created.

## Test

```bash
npm test
```

Tests generate real `sha256=<hex>` signatures over a batch of log events (`verification`, `console`, `function_execution`, `audit_log`, `scheduler_stats`, `current_storage_usage`).
