# Mindbody Webhooks - Next.js Example

Minimal Next.js (App Router) example of receiving [Mindbody](https://www.mindbodyonline.com) webhooks and verifying the `X-Mindbody-Signature` HMAC (and answering the `HEAD` check).

## Prerequisites

- Node.js 18+
- A Mindbody developer account with live access, a linked business and a Webhooks API subscription (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `MINDBODY_MESSAGE_SIGNATURE_KEY` in `.env.local` to the `messageSignatureKey` from the `POST` subscription response, exactly as returned.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/mindbody` (and `HEAD` for Mindbody's URL check) in [app/webhooks/mindbody/route.ts](app/webhooks/mindbody/route.ts); the verification code is in [lib/verify-mindbody.ts](lib/verify-mindbody.ts).

## Test

```bash
npm test
```

The tests cover a valid signature, a hex digest (rejected), a decoded key and a missing `sha256=` prefix (both rejected), the `HEAD` check, another key, a tampered body, a missing header, a trailing newline in the key, invalid JSON, and a missing key.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 mindbody --path /webhooks/mindbody
```

A plain CLI source fails Mindbody's `HEAD` check (Hookdeck answers `HEAD` on it with `405` and doesn't forward it). Before you run the command, create a source of type **Mindbody** named `mindbody` in the Hookdeck dashboard and log in with `npx hookdeck-cli login`: the CLI reuses that source, and Hookdeck answers the `HEAD` check for it. Then use the printed URL as `webhookUrl` and activate the subscription with `PATCH`. Alternatively, allow `HEAD` on the source (Advanced Source Configuration) or add `?x-hookdeck-allow-methods=post,head` to the URL. See [setup](../../references/setup.md).

## Notes

- The route reads `request.arrayBuffer()` before parsing. The HMAC covers the exact raw body, so don't call `request.json()` first.
- The exported `HEAD` handler answers Mindbody's URL check with `200`.
- The key is used as UTF-8 text, even though it looks like base64.
