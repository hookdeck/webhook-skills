# Qlik Cloud Webhooks - Next.js Example

Minimal example of receiving Qlik Cloud webhooks in a Next.js App Router route and verifying the `qlik-signature` header (hex HMAC-SHA256 of the raw body).

## Prerequisites

- Node.js 18+
- A Qlik Cloud webhook with a secret (32-64 characters). Without a secret Qlik Cloud sends no signature (see [references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Put the webhook's secret into `.env.local` as `QLIK_CLOUD_WEBHOOK_SECRET`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts GET, POST, PUT, PATCH and DELETE on `/webhooks/qlik-cloud`. The route reads `await request.arrayBuffer()` so the exact bytes are verified before anything is parsed. Verification and event handling live in `lib/verify-qlik-cloud.ts`.

## Test

```bash
npm test
```

To receive real events locally, tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 qlik-cloud --path /webhooks/qlik-cloud
```
