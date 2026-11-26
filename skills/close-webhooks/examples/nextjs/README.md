# Close Webhooks - Next.js Example

Minimal Next.js (App Router) example of receiving [Close](https://developer.close.com/topics/webhooks/) (close.com CRM) webhooks and verifying the `close-sig-hash` header (hex HMAC-SHA256 of `close-sig-timestamp` and the raw body concatenated, keyed with the hex-decoded `signature_key`).

## Prerequisites

- Node.js 18+
- A Close organization and an API key (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `CLOSE_WEBHOOK_SIGNATURE_KEY` to the `signature_key` returned when you created the webhook subscription, exactly as returned (64 hex characters).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/close` in [app/webhooks/close/route.ts](app/webhooks/close/route.ts); the verification code is in [lib/verify-close.ts](lib/verify-close.ts).

## Test

```bash
npm test
```

The tests sign requests the way Close's sample does. They check a vector built from Close's sample key, a signature keyed with the key as UTF-8 text, the hex key decoded as base64 (48 wrong bytes), another key, a tampered body, a missing header, a `.` between timestamp and body, a changed or missing timestamp, a key with a trailing newline, invalid JSON, and the `500` paths for a missing key or a base64 key.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 close --path /webhooks/close
```

Create a webhook subscription with the printed HTTPS URL as its `url` (`POST /api/v1/webhook/`), then create or update a lead.

## Notes

- The route reads `request.arrayBuffer()` before parsing. The HMAC covers the exact raw body, so don't call `request.json()` first.
- The `signature_key` is **hex**. The handler hex-decodes it, as Close's sample does with `bytearray.fromhex(key)`. A 64-character hex string is also valid base64, so decoding it as base64 gives 48 wrong bytes and every request fails.
- Close signs the timestamp and body concatenated with **no** delimiter.
- Close documents no timestamp tolerance, so the handler doesn't apply one.
- Respond `2xx` within 15 seconds. Close retries failures with exponential backoff (up to every 20 minutes) for up to 72 hours; skip duplicates by `event.id`.
