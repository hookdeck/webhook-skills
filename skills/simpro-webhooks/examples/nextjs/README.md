# Simpro Webhooks - Next.js Example

Minimal example of receiving Simpro webhooks with `X-Response-Signature` (HMAC-SHA1 hex) verification.

## Prerequisites

- Node.js 18+
- A Simpro webhook subscription with a Secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set the Secret on the Simpro webhook subscription to a long random value, then put the same value in `.env` as `SIMPRO_WEBHOOK_SECRET`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

For a live test, expose the endpoint and click **Test Subscription** in Simpro (sends `test.updated`):

```bash
npx hookdeck-cli listen 3000 simpro --path /webhooks/simpro
```
