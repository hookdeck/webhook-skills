# Bland AI Webhooks - Next.js Example

Minimal Next.js App Router example of receiving [Bland AI](https://www.bland.ai) post-call webhooks with `X-Webhook-Signature` (HMAC-SHA256) verification.

## Prerequisites

- Node.js 18+
- A Bland account with a webhook signing secret (Dev Portal → Account Settings → Keys → **Replace Secret**; shown once, see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Bland webhook signing secret to `BLAND_WEBHOOK_SECRET` in `.env.local`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/bland-ai` ([app/webhooks/bland-ai/route.ts](app/webhooks/bland-ai/route.ts)); verification lives in [lib/bland.ts](lib/bland.ts).

## Test

```bash
npm test
```

The tests call the route handler directly with real Bland signatures (`hex(HMAC-SHA256(secret, body))`). They cover post-call payloads, failed calls, enrichment payloads (`citations`, `post_transfer_transcript`, `evals`, `multiple`), SMS payloads, tampered bodies, wrong secrets, redeliveries, non-JSON content types, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 bland-ai --path /webhooks/bland-ai
```

Pass the printed `https://` URL as the `webhook` parameter when sending a call (or set it on an inbound number), then place a call and let it end.

## Notes

- The handler reads `await request.text()`, so the signature covers the exact bytes received whatever the content type. Calling `request.json()` first can break verification. Bland's docs sign `JSON.stringify(req.body)`; for the compact JSON Bland sends that is byte-identical to the raw body.
- Bland sends no timestamp or message id, so there is no replay window. Dedupe on `call_id` (plus `event_type`, since citations and evals arrive as separate webhooks for the same call).
- If `BLAND_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- Enterprise JWT-signed webhooks (RS256 + JWKS) are a different scheme and are not covered here.
