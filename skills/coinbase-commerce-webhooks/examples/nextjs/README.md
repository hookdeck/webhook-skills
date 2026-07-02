# Coinbase Commerce Webhooks - Next.js Example

Minimal example of receiving Coinbase Commerce webhooks with signature
verification using the Next.js App Router and the official
`coinbase-commerce-node` SDK.

## Prerequisites

- Node.js 18+
- A Coinbase Commerce account with a webhook shared secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Coinbase Commerce **shared secret** (Settings → Notifications):
   ```bash
   COINBASE_COMMERCE_WEBHOOK_SECRET=your_webhook_shared_secret_here
   ```

## Run

```bash
npm run dev
```

The webhook endpoint is available at
`POST http://localhost:3000/webhooks/coinbase-commerce`.

## Test

Run the automated tests (they generate real HMAC-SHA256 signatures):

```bash
npm test
```

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel Coinbase Commerce webhooks to your local server
(no account required):

```bash
npx hookdeck-cli listen 3000 coinbase-commerce --path /webhooks/coinbase-commerce
```

Point your Coinbase Commerce endpoint URL (Settings → Notifications) at the
public URL the CLI prints, then create a test charge to trigger events.

## How It Works

- The route handler reads `await request.text()` to get the **raw body** for
  signature verification (parsing JSON first would break the signature).
- `Webhook.verifyEventBody(rawBody, signature, secret)` verifies the
  `X-CC-Webhook-Signature` header and returns the verified event, or throws.
- Invalid or missing signatures return `400`; verified events return `200`.
