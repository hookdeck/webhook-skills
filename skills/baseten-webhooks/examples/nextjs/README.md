# Baseten Webhooks - Next.js Example

Minimal example of receiving Baseten async inference webhooks with `X-BASETEN-SIGNATURE` verification, using the App Router.

## Prerequisites

- Node.js 18+
- Baseten account with a webhook secret (Settings → Secrets)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Baseten webhook secret to `.env.local`. Create a webhook secret in the Baseten Secrets tab and paste it here. Without one, deliveries are unsigned and fail verification.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts `POST /webhooks/baseten`.

## Test

Run the automated tests (they generate real HMAC-SHA256 signatures):

```bash
npm test
```

To receive real deliveries locally:

```bash
npx hookdeck-cli listen 3000 baseten --path /webhooks/baseten
```

Pass the tunnel URL as `webhook_endpoint` when calling `/async_predict`.

## Notes

- The route reads `await request.arrayBuffer()` so the exact bytes are verified; JSON is parsed only afterwards.
- The verifier lives in `lib/baseten.ts`. Bad or missing signatures return `401`. Baseten only retries `500`/`502`/`503`/`504`, once.
