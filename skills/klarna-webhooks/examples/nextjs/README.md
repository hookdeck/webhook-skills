# Klarna Webhooks - Next.js Example

Minimal Next.js (App Router) example of receiving [Klarna](https://www.klarna.com) Notifications API webhooks and verifying the `Klarna-Signature` HMAC.

## Prerequisites

- Node.js 18+
- Klarna Notifications API credentials and a signing key (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `KLARNA_SIGNING_KEY` in `.env.local` to the `signing_key` that createSigningKey returned, as-is.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/klarna` in [app/webhooks/klarna/route.ts](app/webhooks/klarna/route.ts); the verification code is in [lib/verify-klarna.ts](lib/verify-klarna.ts).

## Test

```bash
npm test
```

The tests cover a valid signature, a base64 digest (rejected), another key, a tampered body, a missing header, a trailing newline in the key, invalid JSON, and a missing key.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 klarna --path /webhooks/klarna
```

Create a Klarna webhook with the printed URL (port 443), then simulate an event in the test environment.

## Notes

- The route reads `request.arrayBuffer()` before parsing. The HMAC covers the exact raw body, so don't call `request.json()` first.
- One signing key is configured. During a key rotation, pick the key named by `Klarna-Signing-Key-Id` (see [verification](../../references/verification.md)).
