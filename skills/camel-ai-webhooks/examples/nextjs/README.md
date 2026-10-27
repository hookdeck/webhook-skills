# camelAI Webhooks - Next.js Example

Minimal example of receiving [camelAI](https://camelai.com) (camelRun) webhooks with signature verification in a Next.js App Router route. camelRun signs deliveries per [Standard Webhooks](https://www.standardwebhooks.com/) (`webhook-id`, `webhook-timestamp`, `webhook-signature`), verified here with the [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) package. If `webhook-id` is absent the handler reads the `svix-*` spelling of the same headers instead, as Hookdeck does.

## Prerequisites

- Node.js 18+
- A camelAI account with a webhook endpoint (`POST /v1/webhooks` or the console)
- The endpoint's signing secret (`whsec_...`), shown only once at creation

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Put the endpoint's `whsec_` secret in `CAMEL_AI_WEBHOOK_SECRET`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/camel-ai`.

## Test

```bash
npm test
```

The tests sign payloads the Standard Webhooks way (`base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{id}.{timestamp}.{raw body}"))`). They cover every documented event type, `svix-*` headers, multiple signature entries, tampered bodies, another endpoint's secret, stale timestamps, retries and the fail-closed path.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 camel-ai --path /webhooks/camel-ai
```

Register the printed URL with `POST /v1/webhooks` (or in the console), listing the event types you want such as `run.completed` and `run.failed`.

## Notes

- The route reads `await request.text()` to get the exact bytes, whatever the `Content-Type`, and parses the body only after the check.
- If `CAMEL_AI_WEBHOOK_SECRET` is unset the route returns `500`. It never accepts unverified requests.
- The `standardwebhooks` library rejects timestamps more than 5 minutes old. Hookdeck retries and replays resend the original timestamp, so late retries fail here. For a verifier without that window, see [verification.md](../../references/verification.md).
- Delivery is at least once and can reorder. Dedupe on the event `id` and order by `created`.
- camelAI needs a `2xx` within 10 seconds. Enqueue the event and process it asynchronously in production.
