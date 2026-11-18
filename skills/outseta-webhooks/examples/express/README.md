# Outseta Webhooks - Express Example

Minimal Express example of receiving [Outseta](https://go.outseta.com/support/kb/articles/Rm85R5Q4/secure-and-verify-webhooks-with-a-sha256-signature) webhooks and verifying the `x-hub-signature-256: sha256=<hex>` header (HMAC-SHA256 of the raw body, keyed with the hex-decoded Webhook Signature Key).

## Prerequisites

- Node.js 18+
- An Outseta account with access to Settings > Notifications (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Generate a key with `openssl rand -hex 32`, add it in Outseta under Settings > Notifications, and set `OUTSETA_WEBHOOK_SIGNATURE_KEY` to the same 64-character hex string.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/outseta` in [src/index.js](src/index.js).

## Test

```bash
npm test
```

The tests sign requests the way Outseta's sample does. They check a fixed vector, a signature keyed with the key as UTF-8 text, the hex key decoded as base64 (48 wrong bytes), another key, a tampered body, a missing header, a missing `sha256=` prefix, a key with a trailing newline, invalid JSON, and the `500` paths for a missing key or a base64 key.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 outseta --path /webhooks/outseta
```

Use the printed HTTPS URL as the notification's callback URL (for example for Person Login), then log in to your site.

## Notes

- The route uses `express.raw({ type: '*/*' })`. The HMAC covers the exact raw body, so `express.json()` on this route breaks it.
- The Webhook Signature Key is **hex**: 32 bytes you generate (`openssl rand -hex 32`). The handler hex-decodes it, as Outseta's sample does with `Buffer.from(keyAsHex, "hex")`. A 64-character hex string is also valid base64, so decoding it as base64 gives 48 wrong bytes and every request fails.
- Outseta signs only after you add a key. Until then requests have no `x-hub-signature-256`, and this handler rejects them with `401`.
- Outseta's scheme has no timestamp, so there's nothing to check for freshness.
