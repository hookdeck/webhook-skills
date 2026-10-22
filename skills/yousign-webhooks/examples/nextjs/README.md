# Yousign Webhooks - Next.js Example

Minimal example of receiving Yousign webhooks with signature verification (`X-Yousign-Signature-256`, HMAC-SHA256 of the raw body) using the App Router.

## Prerequisites

- Node.js 18+
- Yousign account with a webhook subscription (its secret key)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your webhook subscription secret to `.env.local` as `YOUSIGN_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000, endpoint `POST /webhooks/yousign`.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 yousign --path /webhooks/yousign
```

Use the Hookdeck URL as the endpoint of your Yousign webhook subscription (sandbox is fine for testing).

## Test

```bash
npm test
```
