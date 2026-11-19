# Kontent.ai Webhooks - Express Example

Minimal Express example of receiving [Kontent.ai](https://kontent.ai) webhooks and verifying the `X-Kontent-ai-Signature` HMAC-SHA256.

## Prerequisites

- Node.js 18+
- A Kontent.ai project and a webhook's Secret (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `KONTENT_AI_WEBHOOK_SECRET` in `.env` to the webhook's Secret, exactly as shown.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/kontent-ai` in [src/index.js](src/index.js).

## Test

```bash
npm test
```

The tests cover a valid signature, a hex digest (rejected), a base64-decoded secret (rejected), a CRLF body verified as sent (and rejected after its line endings are rewritten), a batch of two notifications, another secret, a tampered body, a missing header, a CRLF body through the route, a trailing newline in the secret, invalid JSON, and a missing secret.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 kontent-ai --path /webhooks/kontent-ai
```

Use the printed URL as the webhook URL, then publish or change content to trigger a notification.

## Notes

- The route uses `express.raw({ type: '*/*' })`. The HMAC covers the exact raw body, so don't put `express.json()` in front of it.
- The webhook Secret is used as text, not base64-decoded. Only `X-Kontent-ai-Signature` is checked, not the legacy `X-KC-Signature`.
