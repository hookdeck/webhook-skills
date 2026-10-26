# Live Tennis API Webhooks - Next.js Example

Minimal example of receiving Live Tennis API webhooks in a Next.js App Router route handler with `X-LTAPI-Signature` HMAC-SHA256 verification.

## Prerequisites

- Node.js 18+
- A Live Tennis API direct key on the ULTRA plan
- A webhook registered with `POST /webhooks`, and the `secret` from its 201 response (shown only once)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `LIVE_TENNIS_API_WEBHOOK_SECRET` in `.env.local` to the `secret` returned when you registered the webhook.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000, and the webhook endpoint is `POST /webhooks/live-tennis-api`.

## Test

```bash
npm test
```

The tests sign payloads with Live Tennis API's algorithm, `sha256=` + `hex(HMAC-SHA256(secret, raw body))`, and cover valid, tampered, malformed, non-hex and wrong-length signatures, non-JSON content types, an unsigned timestamp, and every event type.

## How Verification Works

1. The route reads the **raw** body with `request.text()` before any JSON parsing, so any content type verifies.
2. It requires `X-LTAPI-Signature` to be `sha256=` followed by exactly 64 hex characters, and strips the prefix.
3. It computes `HMAC-SHA256(secret, raw body)` and compares the digests with `crypto.timingSafeEqual`.
4. `X-LTAPI-Timestamp` is not signed, so there is no replay window. Dedupe on `sequence` (`score`) and `point.seq` (`point`).

Handled events: `score`, `point`, `break_point`, `break_point_result`.

## Local Testing with Hookdeck

Use the Hookdeck CLI to receive webhooks locally (no account required):

```bash
npx hookdeck-cli listen 3000 live-tennis-api --path /webhooks/live-tennis-api
```

Register the printed URL with `POST /webhooks` (HTTPS, publicly routable) and save the returned `secret`.
