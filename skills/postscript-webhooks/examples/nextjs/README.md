# Postscript Webhooks - Next.js Example

Minimal example of receiving Postscript webhooks and authenticating them with the
`Postscript-Signature` header.

Despite its name, `Postscript-Signature` is not an HMAC of the body: it carries your account's
webhook signing token (from `GET /api/v2/webhooks/token`) as plain text. The handler compares the
whole header value with `POSTSCRIPT_WEBHOOK_TOKEN` in constant time. That authenticates the sender,
not the body, and gives no replay protection, so use HTTPS and keep the token secret (the docs
document no way to rotate it). The route reads the body with `request.text()`, so any content type works.

## Prerequisites

- Node.js 20+
- A Postscript account and API token (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `POSTSCRIPT_WEBHOOK_TOKEN` to the token returned by `GET /api/v2/webhooks/token`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/postscript`.

## Test

```bash
npm test
```

The tests send every documented event with correct, wrong and missing tokens. No Postscript
account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/postscript \
  -H "Content-Type: application/json" \
  -H "Postscript-Signature: $POSTSCRIPT_WEBHOOK_TOKEN" \
  -d '{"webhook_id":"w1","resource_type":"shop","resource_id":"shop_1","event":"shop.subscriber.opt_in","event_data":{"id":"s_1"}}'
```

## Receive Webhooks Locally

Postscript can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 postscript --path /webhooks/postscript
```

Use the printed URL as `callback_url` in `POST /api/v2/webhooks`.

## How It Works

- `lib/verify-postscript.ts`: `verifyPostscriptRequest()`
- `app/webhooks/postscript/route.ts`: the `POST /webhooks/postscript` route

1. The `Postscript-Signature` header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on the `event` field: `shop.incoming_message`,
   `shop.subscriber.opt_in`, `shop.subscriber.opt_out`, `shop.email_collected`.
4. It returns `200 {"received": true}`.
