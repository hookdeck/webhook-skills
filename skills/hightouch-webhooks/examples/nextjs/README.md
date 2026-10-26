# Hightouch Webhooks - Next.js Example

Minimal example of receiving Hightouch HTTP Request destination calls and authenticating them
with a secret header.

Hightouch does not sign requests, so there is no HMAC to verify. The handler looks up the header
named by `HIGHTOUCH_WEBHOOK_HEADER` (default `Authorization`) case-insensitively and compares its
**whole value** with `HIGHTOUCH_WEBHOOK_SECRET` in constant time. A static shared credential
authenticates the sender, not the body, and gives no replay protection, so use HTTPS and rotate
the credential if it leaks.

## Prerequisites

- Node.js 18+
- A Hightouch HTTP Request destination with a secret header (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `HIGHTOUCH_WEBHOOK_HEADER` to the header key you added to the destination and
   `HIGHTOUCH_WEBHOOK_SECRET` to its exact, whole value (including any `Bearer ` prefix).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts `POST`, `PUT`, `PATCH`, `DELETE` and `GET` at
`/webhooks/hightouch`.

## Test

```bash
npm test
```

The tests cover the credential check (correct, wrong, missing, custom header name, whole-value
comparison), every method, empty bodies, batched array bodies and arbitrary content types. No
Hightouch account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/hightouch \
  -H "Content-Type: application/json" \
  -H "Authorization: $HIGHTOUCH_WEBHOOK_SECRET" \
  -d '{"id":"cus_123","email":"alice@example.com"}'
```

## Receive Webhooks Locally

Hightouch can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 hightouch --path /webhooks/hightouch
```

Use the printed URL as the base URL in the Hightouch HTTP Request destination.

## How It Works

- `lib/verify-hightouch.ts`: `verifyHightouchRequest()`; `app/webhooks/hightouch/route.ts`: the handlers

1. The credential header is checked before the body is parsed. Failure returns `401`.
2. The body is read raw (any content type) and may be empty. A non-empty body must be JSON (`400` otherwise).
3. The method picks the trigger: `POST` is `row_added`, `PUT`/`PATCH` is `row_changed`, `DELETE`
   is `row_removed`. This is a convention (Hightouch doesn't send the trigger); match it to your
   sync configuration.
4. With batching the body is an array or an object wrapping one; both are accepted.
5. It returns `200 {"received": true, "trigger": "..."}`.
