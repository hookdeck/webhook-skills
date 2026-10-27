# Fountain Webhooks - Next.js Example

Minimal example of receiving Fountain Hire webhooks with signature verification.

Fountain signs the raw request body with HMAC-SHA256 (hex) in the `X-OBIQ-SIGNATURE-V2` header, using your
Fountain Hire private API token as the key. The route reads the body with `await request.arrayBuffer()`
so the exact bytes are verified and any content type works.

## Prerequisites

- Node.js 20+
- A Fountain Hire account and its private API token (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `FOUNTAIN_WEBHOOK_SECRET` in `.env` to your Fountain Hire private API token.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/fountain`.

## Test

```bash
npm test
```

The tests sign the applicant and worker sample payloads with real HMAC-SHA256 signatures and also send
tampered, truncated, prefixed and missing signatures. No Fountain account is needed.

To try it by hand:

```bash
BODY='{"id":"70bbb9f4-bb94-4dbd-a01c-3a2f9ef3098e","name":"Test Worker","is_active":true}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$FOUNTAIN_WEBHOOK_SECRET" -hex | awk '{print $NF}')
curl -X POST http://localhost:3000/webhooks/fountain \
  -H "Content-Type: application/json" \
  -H "X-OBIQ-SIGNATURE-V2: $SIG" \
  -d "$BODY"
```

## Receive Webhooks Locally

Fountain can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 fountain --path /webhooks/fountain
```

Put the printed URL in Fountain Hire under Company Settings -> Webhooks.

## How It Works

- `lib/verify-fountain.ts`: `verifyFountainSignature()` and `classify()`
- `app/webhooks/fountain/route.ts`: the `POST /webhooks/fountain` route

1. The signature is checked against the raw bytes before parsing. Failure returns `401`.
2. The signature must be exactly 64 hex characters; it is compared in constant time.
3. Fountain has no event-name field, so the handler dispatches on payload shape: `{applicant: {...}}` for
   screening events, a flat worker object for Post-Hire events.
4. The route returns `200 {"received": true}`. Fountain retries failed deliveries twice, so process slow work
   asynchronously.

Only default body signing is supported: accounts switched to applicant ID signing fail verification.
