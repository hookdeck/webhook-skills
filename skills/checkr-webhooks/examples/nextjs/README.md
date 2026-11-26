# Checkr Webhooks - Next.js Example

Minimal Next.js (App Router) example of receiving [Checkr](https://checkr.com) webhooks and verifying the `X-Checkr-Signature` HMAC.

## Prerequisites

- Node.js 18+
- A Checkr account with Developer Settings access, or a Partner Application (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `CHECKR_SIGNING_KEY` in `.env.local` to your oldest secret API key, or to your Partner app's client secret.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/checkr` in [app/webhooks/checkr/route.ts](app/webhooks/checkr/route.ts); the verification code is in [lib/verify-checkr.ts](lib/verify-checkr.ts).

## Test

```bash
npm test
```

The tests cover Checkr's published test vector, the placeholder header, a valid signature, another key, a tampered body, pretty-printed JSON, a missing header, a trailing newline in the key, invalid JSON, and a missing key.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 checkr --path /webhooks/checkr
```

Add the printed URL as a webhook URL in Developer Settings (or on your Partner Application) and create a candidate with a test API key.

## Notes

- The route reads `request.arrayBuffer()` before parsing. The HMAC covers the exact raw body, so don't call `request.json()` first.
- Checkr doesn't guarantee order or single delivery. Dedupe on the event `id` and fetch the object when order matters.
