# Zernio Webhooks - Next.js Example

Minimal example of receiving Zernio webhooks with signature verification (HMAC-SHA256 of the raw body, `X-Zernio-Signature`) using the Next.js App Router.

## Prerequisites

- Node.js 20+
- A Zernio account with a webhook endpoint whose secret you chose yourself (Zernio never generates one)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `ZERNIO_WEBHOOK_SECRET` in `.env.local` to the secret you sent in `POST /v1/webhooks/settings`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

Run the automated tests:

```bash
npm test
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 zernio --path /webhooks/zernio
```

Use the Hookdeck URL as the endpoint `url` in Zernio, then call `POST /v1/webhooks/test` to send a `webhook.test` event.

## Endpoint

- `POST /webhooks/zernio` - Receives and verifies Zernio webhook events
