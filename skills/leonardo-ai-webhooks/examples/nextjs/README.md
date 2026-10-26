# Leonardo.Ai Webhooks - Next.js Example

Minimal example of receiving Leonardo.Ai webhook callbacks in the Next.js App Router and
authenticating them with the `Authorization: Bearer` header.

Leonardo.Ai does not sign payloads. The route checks the header is `Bearer <webhook callback API key>`
(scheme matched case-insensitively) and compares the key with your stored secret in constant time,
then reads the body as text so any content type works.

A static shared credential authenticates the sender, not the body, and gives no replay
protection. Use HTTPS and rotate the key if it leaks.

## Prerequisites

- Node.js 18+
- A Leonardo.Ai production API key with a webhook callback URL and callback API key (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `LEONARDO_AI_WEBHOOK_SECRET` to the webhook callback API key (the bare key, without `Bearer `).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/leonardo-ai`.

## Test

```bash
npm test
```

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/leonardo-ai \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LEONARDO_AI_WEBHOOK_SECRET" \
  -d '{"type":"image_generation.complete","object":"generation","timestamp":1699490546932,"api_version":"v1","data":{"object":{"id":"gen-1","status":"COMPLETE","images":[]}}}'
```

## Receive Webhooks Locally

Leonardo.Ai can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 leonardo-ai --path /webhooks/leonardo-ai
```

Use the printed URL as the webhook callback URL on the production API key.

## How It Works

- `lib/verify-leonardo-ai.ts`: `verifyLeonardoRequest()`
- `app/webhooks/leonardo-ai/route.ts`: the `POST` handler

1. The `Authorization` header is checked before the body is read. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on `type`; `image_generation.complete` is handled, other types are acknowledged.
4. It returns `200 {"received": true}`.
