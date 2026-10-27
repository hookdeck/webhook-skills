# Texture Webhooks - Express Example

Minimal example of receiving Texture webhooks with `Texture-Signature` verification.

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
   cp .env.example .env
   ```

3. Set `TEXTURE_WEBHOOK_SECRET` to the destination's whole secret in `.env`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/texture`.

## Test

```bash
npm test
```

The tests sign payloads with the same algorithm as Texture. To try it by hand:

```bash
BODY='{"type":"device.updated","deviceId":"dev_123"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$TEXTURE_WEBHOOK_SECRET" -hex | sed 's/^.* //')
curl -X POST http://localhost:3000/webhooks/texture \
  -H "Content-Type: application/json" -H "Texture-Signature: $SIG" -d "$BODY"
```

## Receive Texture Webhooks Locally

```bash
npx hookdeck-cli listen 3000 texture --path /webhooks/texture
```

Use the printed URL as the destination URL in Texture.

## How It Works

- `src/index.js`: `verifyTextureSignature()` and the `POST /webhooks/texture` route

1. The body is read raw with `express.raw({ type: '*/*' })`, so any content type works and the
   exact bytes are verified.
2. `Texture-Signature` must be 64 hex characters; it is decoded and compared with
   `crypto.timingSafeEqual`. Failure returns `401`.
3. The body is parsed as JSON only after verification (`400` if it is not a JSON object).
4. The handler dispatches on `type` (`device.updated`, `command.succeeded`, ...) and logs the rest.
5. It returns `200 {"received": true}`.

`Texture-Timestamp` is not signed, so the example does not use it. Dedupe on the event `key`.
