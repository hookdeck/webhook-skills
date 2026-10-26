# Tokity Webhooks - Express Example

Minimal example of receiving Tokity webhooks (ticket changes and chat sessions) and verifying
the `x-dd-signature` header, with Express.

Tokity (formerly DeskDirector) signs the raw request body with HMAC-SHA256 and sends
`sha256=` plus the standard base64 digest. Nothing else is signed, so there is no timestamp
or replay window to check.

## Prerequisites

- Node.js 18+
- A Tokity webhook (or Events action) and its secret (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `TOKITY_WEBHOOK_SECRET` to the secret shown by **Display detail** on the webhook in the
   Tokity Admin Portal. Use it as shown; it is not base64 or hex.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/tokity`.

## Test

```bash
npm test
```

The tests sign real payloads with HMAC-SHA256 (plus a vector computed with `openssl`) and
cover missing, malformed, wrong and non-canonical signatures, plus wrong-typed bodies. To try
it by hand, sign a body and post it:

```bash
BODY='[{"id":22282,"status":"New","from":null}]'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$TOKITY_WEBHOOK_SECRET" -binary | base64)
curl -X POST http://localhost:3000/webhooks/tokity \
  -H "Content-Type: application/json" \
  -H "x-dd-signature: sha256=$SIG" \
  -d "$BODY"
```

## Receive Tokity Webhooks Locally

```bash
npx hookdeck-cli listen 3000 tokity --path /webhooks/tokity
```

Use the printed URL as the receiver URL for the webhook in Tokity. Hookdeck's Tokity source
verifies the signature too, using the same secret.

## How It Works

- `src/index.js`: `verifyTokitySignature()` plus the `POST /webhooks/tokity` route

1. The body is read raw with `express.raw({ type: '*/*' })`, so any content type works and the
   exact bytes are verified.
2. `x-dd-signature` is checked: an optional `sha256=` prefix, then exactly 44 characters of
   standard padded base64, compared with the expected digest in constant time. Failure
   returns `401`.
3. The body is parsed as JSON and must be an object or an array of objects (`400` otherwise).
4. Tokity sends no event name. Each item is a chat session (`status` plus `pastStatus`) or a
   ticket. A ticket's `from` is its previous state (`null` on creation), so the handler diffs
   it against the current fields. Wrong-typed fields are ignored, never a `500`.
5. It returns `200 {"received": true}`.
