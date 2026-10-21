# Motive Webhooks - Next.js Example

Minimal example of receiving Motive (formerly KeepTruckin) webhooks with `X-KT-Webhook-Signature` verification.

## Prerequisites

- Node.js 18+
- A Motive fleet account with API access and a webhook created with a shared secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your webhook's shared secret to `.env.local` as `MOTIVE_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 motive --path /webhooks/motive
```

Use the printed URL as the webhook `url` when you create or update the webhook through the Motive API. Motive sends a test request when you enable it and needs a 200 or 201 back.

### Send a signed request by hand

```bash
BODY='{"action":"fault_code_opened","trigger":"created","id":123,"code_label":"SPN-5610","vehicle":{"id":1,"number":"T123"}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha1 -hmac "$MOTIVE_WEBHOOK_SECRET" | sed 's/^.* //')
curl -X POST http://localhost:3000/webhooks/motive \
  -H 'Content-Type: application/json' -H "X-KT-Webhook-Signature: $SIG" -d "$BODY"
```

Key the HMAC with the shared secret. Motive's own docs sample keys it with the signature, which is wrong.

### Run tests

```bash
npm test
```

## Files

- `app/webhooks/motive/route.ts` - App Router handler (reads the raw body with `request.text()`)
- `lib/verify-motive.ts` - Signature verification (kept outside the route file, which may only export HTTP handlers)
- `test/webhook.test.ts` - Vitest tests

## Endpoint

- `POST /webhooks/motive` - Receives and verifies Motive actions (`vehicle_location_updated`, `fault_code_opened`, `fault_code_closed`, `user_upserted`, and others). Returns 403 for a bad signature, which Motive does not retry.
