# tawk.to Webhooks - Express Example

Minimal example of receiving tawk.to webhooks with `X-Tawk-Signature` (HMAC-SHA1) verification.

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
   cp .env.example .env
   ```
3. Add your webhook secret key to `.env` as `TAWK_WEBHOOK_SECRET`.

## Run

```bash
npm start
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

Tests sign payloads with HMAC-SHA1 the same way tawk.to does.
