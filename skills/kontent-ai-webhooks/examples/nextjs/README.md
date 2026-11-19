# Kontent.ai Webhooks - Next.js Example

Minimal Next.js (App Router) example of receiving [Kontent.ai](https://kontent.ai) webhooks and verifying the `X-Kontent-ai-Signature` HMAC-SHA256.

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
   cp .env.example .env.local
   ```

3. Set `KONTENT_AI_WEBHOOK_SECRET` in `.env.local` to the webhook's Secret, exactly as shown.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/kontent-ai` in [app/webhooks/kontent-ai/route.ts](app/webhooks/kontent-ai/route.ts); the verification code is in [lib/verify-kontent-ai.ts](lib/verify-kontent-ai.ts).

## Test

```bash
npm test
```

The tests cover a valid signature, a hex digest (rejected), a base64-decoded secret (rejected), another secret, a tampered body, a missing header, a trailing newline in the secret, invalid JSON, and a missing secret.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 kontent-ai --path /webhooks/kontent-ai
```

Use the printed URL as the webhook URL, then publish or change content to trigger a notification.

## Notes

- The route reads `request.arrayBuffer()` before parsing. The HMAC covers the exact raw body, so don't call `request.json()` first.
- The webhook Secret is used as text, not base64-decoded. Only `X-Kontent-ai-Signature` is checked, not the legacy `X-KC-Signature`.
