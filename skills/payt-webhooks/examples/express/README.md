# Payt Webhooks - Express Example

Minimal example of receiving Payt webhooks and verifying the `X-PAYT-SIGNATURE` signature (hex HMAC-SHA256
of the raw body).

## Prerequisites

- Node.js 18+
- A Payt administration with webhooks activated and its webhook secret (shown only once, on the webhooks settings page)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `PAYT_WEBHOOK_SECRET` to the secret from the webhooks settings page.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/payt`.

## Test

```bash
npm test
```

The tests sign real payloads (hex HMAC-SHA256 of the raw body) shaped like the documented events and check valid,
missing, malformed, wrong-secret, tampered, re-serialised, prefixed and base64 signatures. To try it by hand:

```bash
BODY='{"event":{"event_name":"invoice_created","context":{"id":1,"invoice_number":"2011-1","amount_open":"1000","currency_code":"EUR","debtor":{"name":"Noa Jacobs"}},"event_time":"2018-06-05T09:48:55.314159Z"}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$PAYT_WEBHOOK_SECRET" -hex | sed 's/^.* //')
curl -X POST http://localhost:3000/webhooks/payt \
  -H "Content-Type: application/json" -H "X-PAYT-SIGNATURE: $SIG" -d "$BODY"
```

## Receive Payt Webhooks Locally

```bash
npx hookdeck-cli listen 3000 payt --path /webhooks/payt
```

Use the printed URL as the webhook URL in Payt (see [../../references/setup.md](../../references/setup.md)).

## How It Works

- `src/index.js`: `verifyPaytSignature()` and the `POST /webhooks/payt` route

1. `express.raw({ type: '*/*' })` reads the body as raw bytes, so any content type works and the exact bytes are verified.
2. The header must be exactly 64 hex characters; it is lowercased and compared in constant time to the hex HMAC-SHA256 of the raw body. A missing, malformed or wrong signature returns `401`; a missing secret returns `500`.
3. Only then is the body parsed (`400` for invalid JSON or a missing `event.event_name`).
4. The handler dispatches on `event.event_name` and logs unhandled events.
5. It returns `200 {"received": true}` (Payt needs a 200 within 10 seconds). Delivery is at least once and unordered: make processing idempotent.
