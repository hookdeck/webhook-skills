# Scrapfly Webhooks - Next.js Example

Minimal Next.js App Router example of receiving Scrapfly webhooks with signature verification.

## Prerequisites

- Node.js 18+
- A Scrapfly account with a webhook configured (see [setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Scrapfly webhook signing secret to `.env`:
   ```bash
   SCRAPFLY_WEBHOOK_SECRET=<value-from-scrapfly-dashboard>
   ```

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000.

## Test

```bash
npm test
```

The test suite generates valid Scrapfly signatures (`upper(hex(HMAC_SHA256(secret, body)))`) and asserts the route accepts/rejects accordingly.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 scrapfly --path /webhooks/scrapfly
```

Paste the printed public URL into the Scrapfly dashboard webhook configuration.

## Endpoint

- `POST /webhooks/scrapfly` — `app/webhooks/scrapfly/route.ts`

## How It Works

The route reads the request as raw text with `await request.text()` (so the bytes are exactly what Scrapfly signed), verifies `X-Scrapfly-Webhook-Signature` with `crypto.timingSafeEqual`, and only then `JSON.parse`s the payload and routes by `X-Scrapfly-Webhook-Resource-Type` or the body's `event` field for Crawler events.
