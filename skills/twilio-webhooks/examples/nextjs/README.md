# Twilio Webhooks - Next.js Example

Twilio webhook receiver implemented as a Next.js App Router route handler. Uses **manual** HMAC-SHA1 verification because the Twilio SDK's `validateRequest` expects an Express-style request and isn't a natural fit for a route handler — but the algorithm is small, well-defined, and identical to what the SDK runs.

## Prerequisites

- Node.js 20+
- A Twilio account and Auth Token

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env.local
   ```

3. Set `TWILIO_AUTH_TOKEN` and `WEBHOOK_BASE_URL` in `.env.local`. The base URL **must** match the URL you configured in the Twilio Console exactly (scheme, host, path).

## Run

```bash
npm run dev
```

The webhook handler lives at `POST /webhooks/twilio`.

## Test

```bash
npm test
```

Tests generate real Twilio signatures with HMAC-SHA1 + base64 and verify both the standalone function and the route handler against valid, missing, invalid, tampered, and wrong-secret cases.

## Notes on URL reconstruction

Twilio signs the **exact URL** you registered. In production, you should:

- Set `WEBHOOK_BASE_URL` to the externally-facing origin (e.g. `https://example.com`), or
- Reconstruct the URL from `x-forwarded-proto` + `x-forwarded-host` (set by Vercel, Cloudflare, etc.).

The route in `app/webhooks/twilio/route.ts` defaults to `WEBHOOK_BASE_URL` when set, otherwise falls back to the request's `host` header.
