# Browserbase Webhooks - Next.js Example

Minimal Next.js App Router example of receiving [Browserbase](https://www.browserbase.com) webhooks with Standard Webhooks signature verification, using the [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) package that Browserbase's docs recommend.

## Prerequisites

- Node.js 18+
- A Browserbase project, plus an API key if you register the webhook with the SDK or API
- The webhook signing secret (`whsec_...`). Browserbase shows it **only** when you create or rotate the webhook (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Browserbase webhook signing secret to `BROWSERBASE_WEBHOOK_SECRET` in `.env.local`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/browserbase` ([app/webhooks/browserbase/route.ts](app/webhooks/browserbase/route.ts)).

## Test

```bash
npm test
```

The tests call the route handler directly with real Standard Webhooks signatures. They cover every documented event type, tampered bodies, stale timestamps, multiple signatures, secret rotation, redeliveries, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 browserbase --path /webhooks/browserbase
```

Register the printed `https://` URL as the endpoint in Settings → Webhooks (or with `bb.webhooks.create`), subscribe to the events you want, then invoke a Function to trigger `functions.invocations.completed` or `functions.invocations.failed`.

## Notes

- The handler reads `await request.text()`. The signature covers the exact raw body, so calling `request.json()` before verification breaks it.
- If `BROWSERBASE_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- `BROWSERBASE_WEBHOOK_SECRET_PREVIOUS` is optional. After a rotation Browserbase keeps the old secret verifying for 24 hours, so the handler tries the current secret first and then the previous one.
- Browserbase needs a `2xx` within **15 seconds** and retries otherwise. Store or enqueue the event and process it asynchronously in production.
- Redeliveries are deduped on the envelope `id` (in memory here; use a database or cache in production).
