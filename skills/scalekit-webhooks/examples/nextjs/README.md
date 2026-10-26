# Scalekit Webhooks - Next.js Example

Minimal example of receiving [Scalekit](https://scalekit.com) webhooks with signature verification. Scalekit signs deliveries with [Standard Webhooks](https://www.standardwebhooks.com), so the handler verifies the `webhook-id`, `webhook-timestamp` and `webhook-signature` headers with the [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) package. If `webhook-id` is absent it reads the `svix-*` headers instead, as Hookdeck does.

## Prerequisites

- Node.js 18+
- A Scalekit environment with a webhook endpoint, and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put your endpoint's signing secret in `SCALEKIT_WEBHOOK_SECRET`. Copy it from **Dashboard > Webhooks > any endpoint** (see [setup](../../references/setup.md)).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/scalekit` (`app/webhooks/scalekit/route.ts`).

## Test

```bash
npm test
```

The tests sign payloads the way Scalekit does (`base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{webhook-id}.{webhook-timestamp}.{raw body}"))`). They cover Scalekit directory, organization and user events, tampered bodies, stale timestamps, multiple signatures, another endpoint's secret, retried deliveries, deliveries sent with `svix-*` headers, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 scalekit --path /webhooks/scalekit
```

Register the printed URL as an endpoint in **Dashboard > Webhooks**, subscribe to events such as `organization.directory.user_created`, then trigger one (or **Resend** a message from the endpoint's message log).

## Notes

- The route reads the body with `request.text()`. The signature covers the exact raw body bytes, so calling `request.json()` before verification breaks it.
- If `SCALEKIT_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- The `standardwebhooks` library always enforces a 5-minute timestamp window. A retry or replay through Hookdeck keeps its original timestamp and is rejected once it is more than 5 minutes old. See [verification.md](../../references/verification.md) for a manual verifier where the window can be dropped.
- The handler dedupes on the event `id` (`evt_…`), which stays the same across retries, and falls back to `webhook-id`. Deliveries can arrive out of order, so compare `occurred_at` before overwriting newer data.
- Scalekit needs a `2xx` within **30 seconds** (it recommends `201`). Enqueue the event and process it asynchronously in production.
