# Monnify Webhooks - Next.js Example

Minimal Next.js (App Router) example of receiving [Monnify](https://monnify.com) webhooks and verifying the `monnify-signature` HMAC-SHA512.

## Prerequisites

- Node.js 18+
- A Monnify merchant account (signed webhooks need the live environment) and its client secret key (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `MONNIFY_CLIENT_SECRET` in `.env.local` to your client secret key from the Monnify dashboard.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/monnify` in [app/webhooks/monnify/route.ts](app/webhooks/monnify/route.ts); the verification code is in [lib/verify-monnify.ts](lib/verify-monnify.ts).

## Test

```bash
npm test
```

The tests cover a valid HMAC-SHA512 signature, a base64 digest (rejected), plain SHA-512 of secret + body (rejected), another secret, a tampered body, a missing header, a trailing newline in the secret, invalid JSON, and a missing secret.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 monnify --path /webhooks/monnify
```

Set the printed URL as a webhook URL in the Monnify dashboard. Sandbox deliveries carry no `monnify-signature`, so the example answers them with `401`.

## Notes

- The route reads `request.arrayBuffer()` before parsing. The HMAC covers the exact raw body, so don't call `request.json()` first.
- Monnify's sandbox sends no `monnify-signature`, so sandbox deliveries get `401`. That's expected.
