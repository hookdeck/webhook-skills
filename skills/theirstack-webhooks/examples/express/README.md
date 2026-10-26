# TheirStack Webhooks - Express Example

Minimal example of receiving TheirStack webhooks with signature verification.

## Prerequisites

- Node.js 18+
- TheirStack account with a webhook that has a signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your TheirStack webhook signing secret to `.env` as `THEIRSTACK_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 3000 theirstack --path /webhooks/theirstack
```

Use the printed URL as the **Webhook URL** on your TheirStack webhook, then click **Send test event**.

### Run the tests

```bash
npm test
```

## Endpoint

- `POST /webhooks/theirstack` - Receives and verifies TheirStack webhook events

## Notes

- The signature header is `X-TheirStack-Signature-256: sha256=<hex>` (HMAC-SHA256 of the raw body). It is only sent when a signing secret is set; unsigned deliveries are rejected with 401.
- The body is read with `express.raw({ type: '*/*' })` so any content type verifies.
- The event name is in the body: `{ id, type, payload }`.
