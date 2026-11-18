# Authorize.net Webhooks - Next.js Example

Minimal Next.js (App Router) example of receiving [Authorize.net](https://www.authorize.net) webhooks and verifying the `X-ANET-Signature` HMAC-SHA512.

## Prerequisites

- Node.js 18+
- An Authorize.net merchant or sandbox account with a Signature Key (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `AUTHORIZE_NET_SIGNATURE_KEY` in `.env.local` to your Signature Key, exactly as shown in the Merchant Interface.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/authorize-net` in [app/webhooks/authorize-net/route.ts](app/webhooks/authorize-net/route.ts); the verification code is in [lib/verify-authorize-net.ts](lib/verify-authorize-net.ts).

## Test

```bash
npm test
```

The tests cover a valid signature, a base64 digest (rejected), a missing `sha512=` prefix (rejected), a hex-decoded key (rejected), lowercase hex (accepted), another key, a tampered body, a missing header, a trailing newline in the key, invalid JSON, and a missing key.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 authorize-net --path /webhooks/authorize-net
```

Add the printed URL as a webhook in the Merchant Interface, then send a test with the webhook's ping endpoint.

## Notes

- The route reads `request.arrayBuffer()` before parsing. The HMAC covers the exact raw body, so don't call `request.json()` first.
- The Signature Key is used as text, not hex-decoded, and the hex comparison is case-insensitive.
