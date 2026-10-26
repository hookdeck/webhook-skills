# Texture Webhooks - Next.js Example

Minimal example of receiving Texture webhooks with `Texture-Signature` verification in the
Next.js App Router.

Texture signs each delivery with the lowercase hex HMAC-SHA256 of the raw request body, keyed
with the destination's `secret`. Paste the whole secret, including the whsec_ prefix. Texture
uses it as a plain HMAC key. It is not a Standard Webhooks key, so don't use the `svix` or
`standardwebhooks` libraries.

## Prerequisites

- Node.js 18+
- A Texture webhook destination and its `secret`

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `TEXTURE_WEBHOOK_SECRET` to the destination's whole secret in `.env.local`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/texture`.

## Test

```bash
npm test
```

The tests sign payloads with the same algorithm as Texture.

## Receive Texture Webhooks Locally

```bash
npx hookdeck-cli listen 3000 texture --path /webhooks/texture
```

Use the printed URL as the destination URL in Texture.

## How It Works

- `lib/verify-texture.ts`: `verifyTextureSignature()`
- `app/webhooks/texture/route.ts`: the `POST` route handler

1. The route reads the raw bytes with `await request.arrayBuffer()`, whatever the content type.
2. `Texture-Signature` must be 64 hex characters; it is decoded and compared with
   `crypto.timingSafeEqual`. Failure returns `401`.
3. The body is parsed as JSON only after verification (`400` if it is not a JSON object).
4. The handler dispatches on `type` (`device.updated`, `command.succeeded`, ...) and logs the rest.

`Texture-Timestamp` is not signed, so the example does not use it. Dedupe on the event `key`.
