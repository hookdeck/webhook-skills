# PayNow Webhooks - Next.js Example

Minimal example of receiving PayNow (paynow.gg) webhooks with signature verification in the Next.js App Router.

## Prerequisites

- Node.js 18+
- A PayNow store with a JSON (v1) webhook and its signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your PayNow webhook signing secret to `.env.local` as `PAYNOW_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000, with the webhook at `POST /webhooks/paynow-gg`.

## Test

```bash
npm test
```

The tests sign payloads the way PayNow does (`base64(HMAC-SHA256(secret, "<PayNow-Timestamp>.<raw body>"))`).

To receive real webhooks locally, run the Hookdeck CLI (no account needed) and set the printed URL as the webhook URL in PayNow:

```bash
npx hookdeck-cli listen 3000 paynow-gg --path /webhooks/paynow-gg
```

## Notes

- The route reads `await request.arrayBuffer()` so the exact bytes are verified for any content type. JSON is parsed only after the signature passes.
- Verification lives in `lib/verify.ts`; the route file only exports the handler.
- Old timestamps are not rejected by default. To opt in, set `PAYNOW_WEBHOOK_TOLERANCE_SECONDS` (`PayNow-Timestamp` is Unix milliseconds).
