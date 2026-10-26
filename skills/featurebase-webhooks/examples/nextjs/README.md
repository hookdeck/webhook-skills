# Featurebase Webhooks - Next.js Example

Minimal example of receiving [Featurebase](https://featurebase.app) webhooks with signature verification in a Next.js App Router route handler. Featurebase signs each delivery with a hex HMAC-SHA256 in `X-Webhook-Signature`, computed over `{X-Webhook-Timestamp}.{raw body}`. The verifier in `lib/verify.ts` uses Node's `crypto`. This is not Standard Webhooks, so the `standardwebhooks` and `svix` libraries do not apply.

## Prerequisites

- Node.js 18+
- A Featurebase workspace on the Growth plan or higher
- The signing secret (`whsec_...`) of your webhook

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Put the signing secret in `FEATUREBASE_WEBHOOK_SECRET`. Paste the whole secret, including the whsec_ prefix. Featurebase uses it as a plain HMAC key.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/featurebase`.

## Test

```bash
npm test
```

The tests sign payloads the way Featurebase does (`hex(HMAC-SHA256(secret, "{timestamp}." + raw body))`).

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 featurebase --path /webhooks/featurebase
```

Add the printed URL in **Settings → Developers → Webhooks**, select topics such as `post.created` and `comment.created`, then create a Request on your board.

## Notes

- The route reads `await request.arrayBuffer()` and parses JSON only after the signature check.
- Old timestamps are **not** rejected by default: Hookdeck retries and replays resend the original timestamp. Set `FEATUREBASE_WEBHOOK_TOLERANCE_SECONDS` (for example `300`) to opt in.
- Bad or missing signature returns `401`. If `FEATUREBASE_WEBHOOK_SECRET` is unset the handler returns `500`.
- Featurebase needs `200`, `201`, `202` or `204` within **5 seconds**. Enqueue the event and process it asynchronously in production.
