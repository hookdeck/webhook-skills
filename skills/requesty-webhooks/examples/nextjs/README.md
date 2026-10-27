# Requesty Webhooks - Next.js Example

Minimal Next.js App Router example of receiving [Requesty](https://docs.requesty.ai/features/webhook-signatures) (LLM routing gateway spending alerts and sample requests) webhooks with signature verification. Requesty signs deliveries with [Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks), so the route verifies the `webhook-id`, `webhook-timestamp` and `webhook-signature` headers with the [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) package. If `webhook-id` is absent it falls back to the `svix-*` headers, as Hookdeck does.

## Prerequisites

- Node.js 18+
- A Requesty organisation with a webhook signing secret (`whsec_...`). Until one exists, deliveries are unsigned and fail verification

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Put your organisation's signing secret (Admin Panel > Alerts > Webhook signing secret) in `REQUESTY_WEBHOOK_SECRET`, including the `whsec_` prefix (see [setup](../../references/setup.md)). Requesty creates it the first time you save a webhook URL.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/requesty` ([app/webhooks/requesty/route.ts](app/webhooks/requesty/route.ts)).

## Test

```bash
npm test
```

The tests call the route handler directly with signatures made the way Requesty makes them. They cover tampered bodies, stale timestamps, multiple signatures, the `svix-*` header fallback, another organisation's secret, retries with the same `webhook-id`, sample requests, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 requesty --path /webhooks/requesty
```

Save the URL the CLI prints as your JSON alert webhook (Admin Panel > Alerts), then lower an alert threshold or send a sampled request.

## Notes

- The handler reads `await request.text()`. The signature covers the exact raw body, so calling `request.json()` before verification breaks it.
- If `REQUESTY_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- The `standardwebhooks` library always enforces a 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so late ones fail. Use the manual verifier in [references/verification.md](../../references/verification.md) to drop or widen the window.
- Delivery is at-least-once. The handler dedupes on `webhook-id`, which is the same on every retry.
- Requesty times out after **15 seconds**. Enqueue the event and process it asynchronously in production.
