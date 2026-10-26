# Canny Webhooks - Next.js Example

Minimal Next.js App Router example of receiving [Canny](https://canny.io) webhooks with signature verification. Canny signs requests following Standard Webhooks (`webhook-id`, `webhook-timestamp`, `webhook-signature`), verified here with the [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) package.

## Prerequisites

- Node.js 18+
- A Canny account with access to **Your Subdomain > Settings > API**
- The `whsec_...` signing secret shown there once a webhook is added

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Put the signing secret in `CANNY_WEBHOOK_SECRET`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/canny` ([app/webhooks/canny/route.ts](app/webhooks/canny/route.ts)).

## Test

```bash
npm test
```

The tests call the route handler directly with real Standard Webhooks signatures. They cover tampered bodies, stale timestamps, two signatures during rotation, a wrong secret, ignored legacy `canny-*` headers, non-JSON content types, retried deliveries, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 canny --path /webhooks/canny
```

Add the printed URL as a webhook in Canny's API settings, then create a post or vote.

## Notes

- The handler reads `await request.text()`. The signature covers the exact raw body, so calling `request.json()` before verification breaks it.
- The `standardwebhooks` library always enforces a 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so a late retry is rejected. For a configurable window, use the manual verifier in [references/verification.md](../../references/verification.md).
- The legacy `canny-timestamp`, `canny-nonce` and `canny-signature` headers are ignored. They are being removed.
- Canny bodies have no event ID. The handler dedupes on `webhook-id`.
- If `CANNY_WEBHOOK_SECRET` is unset the handler returns `500`. It never accepts unverified requests.
