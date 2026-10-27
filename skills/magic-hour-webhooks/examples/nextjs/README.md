# Magic Hour Webhooks - Next.js Example

Minimal example of receiving Magic Hour webhooks with signature verification, using the Next.js
App Router.

Magic Hour signs each delivery with a hex HMAC-SHA256 of `{magic-hour-event-timestamp}.{raw body}`
in the `magic-hour-event-signature` header. This is **not** Standard Webhooks, so the example
verifies with Node's `crypto` module rather than the svix or standardwebhooks libraries.

## Prerequisites

- Node.js 18+
- A Magic Hour account and a webhook secret (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your webhook secret to `.env.local` as `MAGIC_HOUR_WEBHOOK_SECRET`. Paste the whole
   secret, including the `whsec_` prefix. Magic Hour uses it as a plain HMAC key.

Optionally set `MAGIC_HOUR_WEBHOOK_TOLERANCE_SECONDS` (for example `300`) to reject stale
timestamps. It is off by default because retries and replays resend the original timestamp.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts `POST /webhooks/magic-hour`.

## Test

```bash
npm test
```

The tests generate real signatures with the same algorithm Magic Hour uses. To trigger real
deliveries, create a job with the Magic Hour API after registering the webhook.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 magic-hour --path /webhooks/magic-hour
```

Use the printed URL as the Endpoint URL when you create the webhook in the Magic Hour Developer Hub.

## How It Works

- `lib/verify-magic-hour.ts`: `verifyMagicHourSignature()`
- `app/webhooks/magic-hour/route.ts`: the `POST` handler, which reads `await request.arrayBuffer()` so the exact bytes are verified

1. The signature header must be exactly 64 hex characters (checked before decoding).
2. The signed message is built as bytes: timestamp header (latin1) + `.` + the raw body.
3. The expected digest is compared in constant time. A missing, malformed or wrong signature returns `401`.
4. Only then is the body parsed and dispatched on `type` (`video.*`, `image.*`, `audio.*`).
5. It returns `200 {"received": true}`.
