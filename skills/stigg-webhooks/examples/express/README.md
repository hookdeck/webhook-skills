# Stigg Webhooks - Express Example

Minimal example of receiving Stigg webhooks with secret verification and event handling.

> **Stigg does not sign webhook payloads yet** (HMAC is on its roadmap). Each event
> carries the webhook secret in the `Stigg-Webhooks-Secret` header. This example
> compares it with `STIGG_WEBHOOK_SECRET` in constant time.

## Prerequisites

- Node.js 18+
- Stigg account with access to Settings > Integrations > Webhooks

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the webhook secret from your Stigg webhook details page to `.env`. If it is not set, the endpoint returns `500` (fails closed).

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the unit tests:

```bash
npm test
```

### Receive webhooks locally

```bash
npx hookdeck-cli listen 3000 stigg --path /webhooks/stigg
```

Use the Hookdeck URL as your Stigg webhook endpoint URL, then use **Send test event** in Stigg.

Send a request manually:

```bash
curl -X POST http://localhost:3000/webhooks/stigg \
  -H "Content-Type: application/json" \
  -H "Stigg-Webhooks-Secret: your_webhook_secret" \
  -d '{"type":"customer.created","messageId":"a6ce","id":"customer-test-id"}'
```

## Endpoint

- `POST /webhooks/stigg` - Checks `Stigg-Webhooks-Secret`, dispatches on `type`
