# Baseten Webhooks - Express Example

Minimal example of receiving Baseten async inference webhooks with `X-BASETEN-SIGNATURE` verification.

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
   cp .env.example .env
   ```

3. Add your Baseten webhook secret to `.env`. Create a webhook secret in the Baseten Secrets tab and paste it here. Without one, deliveries are unsigned and fail verification.

## Run

```bash
npm start
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

- The route uses `express.raw({ type: '*/*' })` so the exact bytes are verified; JSON is parsed only afterwards.
- Bad or missing signatures return `401`. Baseten only retries `500`/`502`/`503`/`504`, once.
