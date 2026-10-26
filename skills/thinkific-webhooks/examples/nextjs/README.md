# Thinkific Webhooks - Next.js Example

Minimal example of receiving Thinkific webhooks and verifying the `X-Thinkific-Hmac-Sha256` signature.

Thinkific sends the lowercase hex HMAC-SHA256 of the raw request body in `X-Thinkific-Hmac-Sha256`
(no prefix), keyed with the UTF-8 bytes of your secret. The route reads the body with `await request.arrayBuffer()`, so any content type works and the exact bytes are verified. The body is parsed only after the
signature is verified. Nothing but the body is signed, so there is no timestamp to check.

## Prerequisites

- Node.js 18+
- A Thinkific site with a webhook (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `THINKIFIC_WEBHOOK_SECRET`. Paste the webhook's signing secret. Older webhooks are signed with the site API key, and OAuth app webhooks with the app client secret.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/thinkific`.

## Test

```bash
npm test
```

The tests sign order, enrollment, user, course and transaction payloads (based on Thinkific's
documented samples) and cover valid, uppercase, malformed, wrong-secret, tampered, missing and empty
signatures. No Thinkific account is needed.

To try it by hand:

```bash
BODY='{"id":"1","resource":"user","action":"signup","payload":{"id":123456}}'
SIG=$(printf %s "$BODY" | openssl dgst -sha256 -hmac "$THINKIFIC_WEBHOOK_SECRET" | awk '{print $NF}')
curl -X POST http://localhost:3000/webhooks/thinkific \
  -H "Content-Type: application/json" \
  -H "X-Thinkific-Hmac-Sha256: $SIG" \
  -d "$BODY"
```

## Receive Webhooks Locally

Thinkific can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 thinkific --path /webhooks/thinkific
```

Use the printed URL as the webhook URL in Thinkific.

## How It Works

- `lib/verify-thinkific.ts`: `verifyThinkificSignature()`; `app/webhooks/thinkific/route.ts`: the `POST` handler

1. The raw body and `X-Thinkific-Hmac-Sha256` are read. A missing, malformed or mismatched
   signature returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on `resource` and `action` (for example `order.created`,
   `enrollment.completed`, `user.signup`). `cart.abandoned` has a different envelope (`name` and `data`).
4. It returns `200 {"received": true}`. Thinkific retries non-2xx responses, so make handlers idempotent.
