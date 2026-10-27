# Infinite Giving Webhooks - Next.js Example

Minimal example of receiving Infinite Giving webhooks with signature verification.

> Infinite Giving webhooks are for integration partners. Paste the signing secret Infinite Giving gives you at partner kickoff.

## Prerequisites

- Node.js 18+
- Infinite Giving integration partner account with the signing secret from partner kickoff

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your signing secret to `.env` as `INFINITE_GIVING_WEBHOOK_SECRET`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. The webhook endpoint is `POST /webhooks/infinite-giving` (`app/webhooks/infinite-giving/route.ts`).

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 infinite-giving --path /webhooks/infinite-giving
```

## Test

```bash
npm test
```

The tests sign payloads with HMAC-SHA256 over `{X-IG-Timestamp}.{raw body}` exactly as Infinite Giving does.

## Notes

- The route reads `await request.arrayBuffer()` so the exact bytes are verified; JSON is parsed only after the signature check.
- Old timestamps are not rejected by default (retries and replays resend the original). Set `INFINITE_GIVING_WEBHOOK_TOLERANCE_SECONDS` to opt in.
