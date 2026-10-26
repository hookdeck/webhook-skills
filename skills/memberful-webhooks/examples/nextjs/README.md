# Memberful Webhooks - Next.js Example

Minimal example of receiving Memberful webhooks with `X-Memberful-Webhook-Signature` verification (hex HMAC-SHA256 of the raw body).

## Prerequisites

- Node.js 18+
- A Memberful webhook (Settings → Webhooks) and its secret; see [../../references/setup.md](../../references/setup.md)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `MEMBERFUL_WEBHOOK_SECRET` in `.env`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and serves `/webhooks/memberful` for POST (Memberful only sends POST; other methods get `405`).

## Test

```bash
npm test
```

The tests sign payloads with the real algorithm and cover valid, missing, wrong, malformed and prefixed signatures, exact-bytes verification, non-POST methods, any content type, all 22 documented events and wrong-typed fields. No Memberful account is needed.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 memberful --path /webhooks/memberful
```

Use the printed URL as the endpoint URL when you create the webhook in Memberful. Hookdeck's Memberful source verifies the signature and manages the method as POST.

## How It Works

- `lib/verify-memberful.ts`: `verifyMemberfulSignature()`
- `app/webhooks/memberful/route.ts`: the `POST` export

1. The raw body bytes are read (`request.arrayBuffer()`) and the `X-Memberful-Webhook-Signature` header is verified first: exactly 64 hex characters, then a constant-time compare against the hex HMAC-SHA256. Failure returns `401`.
2. A non-POST request gets `405`.
3. The body must be a JSON object (`400` if not). Fields are type-checked before use.
4. The handler dispatches on the top-level `event` field (an assumption: Memberful's docs list event names but never show where the name travels, so confirm against a real delivery) across the 22 documented events. Anything else is logged.
5. It returns `200 {"received": true}`.
