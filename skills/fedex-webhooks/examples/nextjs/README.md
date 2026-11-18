# FedEx Webhooks - Next.js Example

Minimal Next.js (App Router) example of receiving [FedEx](https://www.fedex.com) Advanced Integrated Visibility webhooks and verifying the `fdx-signature` HMAC.

## Prerequisites

- Node.js 18+
- A FedEx Developer Portal login and a security token (26-100 characters) (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `FEDEX_WEBHOOK_SECURITY_TOKEN` in `.env.local` to the security token you set on the webhook.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/fedex` in [app/webhooks/fedex/route.ts](app/webhooks/fedex/route.ts); the verification code is in [lib/verify-fedex.ts](lib/verify-fedex.ts).

## Test

```bash
npm test
```

The tests cover a valid signature, a hex digest (rejected), another token, a tampered body, a missing header, a trailing newline in the token, invalid JSON, and a missing token. The test bodies are synthetic stand-ins, not FedEx's schema.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 fedex --path /webhooks/fedex
```

Paste the printed URL and your security token into **Try this webhook** in the FedEx Developer Portal to send a signed mock payload.

## Notes

- The route reads `request.arrayBuffer()` before parsing. The HMAC covers the exact raw body, so don't call `request.json()` first.
- FedEx treats anything other than `200` or `202` as a failure, including during URL validation.
