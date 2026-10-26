# Teachfloor Webhooks - Express Example

Minimal example of receiving Teachfloor webhooks and verifying the `teachfloor-signature`
header (HMAC-SHA256 of the raw body, hex).

## Prerequisites

- Node.js 18+
- A Teachfloor endpoint under Developers > Webhooks (its signing secret comes from
  **Reveal Signing Secret**; see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `TEACHFLOOR_WEBHOOK_SECRET` to the endpoint's signing secret.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/teachfloor`.

## Test

```bash
npm test
```

The tests sign payloads with the same algorithm Teachfloor uses and cover valid, tampered,
wrong-secret, malformed and missing signatures, any content type, wrong-typed payload fields,
and every documented event type. No Teachfloor account is needed.

## Receive Teachfloor Webhooks Locally

```bash
npx hookdeck-cli listen 3000 teachfloor --path /webhooks/teachfloor
```

Put the printed URL in the endpoint's URL field under **Developers > Webhooks**.

## How It Works

- `src/index.js`: `verifyTeachfloorSignature()` plus the `POST /webhooks/teachfloor` route

1. The body is read as raw bytes with `express.raw({ type: '*/*' })`, so the signature covers the exact bytes received whatever
   the content type.
2. The `teachfloor-signature` header must be exactly 64 hex characters; the handler computes the
   HMAC-SHA256 of the body with the signing secret and compares in constant time (`401` on failure).
3. Only then is the body parsed; it must be a JSON object (`400` otherwise), and nested fields
   are type-checked before use.
4. The handler dispatches on the top-level `type` (`course.join`, `course.completed`,
   `element.completed`, `member.login`, and the course, module and element lifecycle events),
   logs anything else, and returns `200 {"received": true}`.
