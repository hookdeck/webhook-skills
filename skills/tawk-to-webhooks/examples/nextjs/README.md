# tawk.to Webhooks - Next.js Example

Minimal example of receiving tawk.to webhooks with `X-Tawk-Signature` (HMAC-SHA1) verification, using the App Router.

## Prerequisites

- Node.js 18+
- tawk.to account with a webhook secret key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```
3. Add your webhook secret key to `.env.local` as `TAWK_WEBHOOK_SECRET`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts `POST /webhooks/tawk-to`.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 tawk-to --path /webhooks/tawk-to
```

Use the printed URL as the webhook URL in the tawk.to dashboard (`Admin` section).

## Test

```bash
npm test
```
