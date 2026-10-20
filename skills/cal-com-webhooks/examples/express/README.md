# Cal.com Webhooks - Express Example

Minimal example of receiving Cal.com webhooks with `x-cal-signature-256` signature verification.

## Prerequisites

- Node.js 18+
- A Cal.com webhook with a **Secret** set (Settings → Developer → Webhooks)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `CALCOM_WEBHOOK_SECRET` in `.env` to the same secret you entered on the Cal.com webhook.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/cal-com` (`src/index.js`).

## Test

```bash
npm test
```

The tests sign payloads with real HMAC-SHA256 signatures and cover valid/invalid/missing signatures,
`no-secret-provided`, booking events, and the flat `MEETING_ENDED` payload.

## Receive real webhooks locally

Cal.com SaaS only accepts public HTTPS subscriber URLs, so expose your server with the Hookdeck CLI
(no account required):

```bash
npx hookdeck-cli listen 3000 cal-com --path /webhooks/cal-com
```

Use the tunnel URL as the webhook's Subscriber URL, then book (and cancel) a test meeting to
trigger `BOOKING_CREATED` and `BOOKING_CANCELLED`.

## How verification works

The handler reads the raw body with `express.raw({ type: '*/*' })`, computes the lowercase hex
HMAC-SHA256 of it using `CALCOM_WEBHOOK_SECRET`, and compares it timing-safely with the
`x-cal-signature-256` header. Requests with a missing or invalid signature get `400`; an unset
secret gets `500`. The body is parsed as JSON only after verification, so if you use a custom
payload template, keep it valid JSON (non-JSON templates are sent form-encoded and this example
rejects them with `400 Invalid JSON`). See
[../../references/verification.md](../../references/verification.md) for details.
