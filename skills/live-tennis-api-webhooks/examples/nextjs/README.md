# Live Tennis API Webhooks - Next.js Example

Minimal example of receiving Live Tennis API webhooks in a Next.js App Router route handler with `X-LTAPI-Signature-V1` HMAC-SHA256 verification.

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

The tests sign payloads with Live Tennis API's algorithm, `t=<unix>,v1=` + `hex(HMAC-SHA256(secret, "<t>.<raw body>"))`, and cover valid, tampered, malformed, non-hex and wrong-length signatures, several `v1` values, stale and re-stamped timestamps, no fallback to the deprecated `X-LTAPI-Signature`, repeated `delivery_id`s, non-JSON content types, and every event type.

## How Verification Works

1. The route reads the **raw** body with `request.text()` before any JSON parsing, so any content type verifies.
2. It reads `t` and every `v1` from `X-LTAPI-Signature-V1`, and rejects a `t` more than 5 minutes from the server clock.
3. It computes `HMAC-SHA256(secret, "<t>." + raw body)` and accepts the request if any `v1` matches, compared in constant time. It never falls back to the deprecated `X-LTAPI-Signature`.
4. It dedupes on the body's `delivery_id`, keeping each id until `t` + 5 minutes (in memory here; use a shared store with an atomic insert-if-absent when you run several workers).

Handled events: `score`, `score_withdrawn`, `point`, `break_point`, `break_point_result`, `status`.

## Local Testing with Hookdeck

Use the Hookdeck CLI to receive webhooks locally (no account required):

```bash
npx hookdeck-cli listen 3000 live-tennis-api --path /webhooks/live-tennis-api
```

Register the printed URL with `POST /webhooks` (HTTPS, publicly routable) and save the returned `secret`.
