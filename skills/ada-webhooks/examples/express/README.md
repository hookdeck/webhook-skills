# Ada Webhooks - Express Example

Minimal example of receiving [Ada](https://www.ada.cx) webhooks with signature verification. Ada delivers webhooks through Svix, so the handler verifies the `svix-id`, `svix-timestamp` and `svix-signature` headers with the [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) package (the Svix-maintained reference implementation of the same scheme).

## Prerequisites

- Node.js 18+
- An Ada AI Agent with access to **Config > PLATFORM > Webhooks**
- The signing secret (`whsec_...`) of your webhook endpoint

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put your endpoint's signing secret in `ADA_WEBHOOK_SECRET`. Copy it from the endpoint page in the Ada dashboard, or fetch it with `GET /api/v2/webhooks/{id}/secret/` (see [setup](../../references/setup.md)). Each endpoint has its own secret.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/ada`.

## Test

```bash
npm test
```

The tests sign payloads the way Svix does (`base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{svix-id}.{svix-timestamp}.{raw body}"))`). They cover tampered bodies, stale timestamps, multiple signatures, another endpoint's secret, retried deliveries, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 ada --path /webhooks/ada
```

Add the printed URL as an endpoint in **Config > PLATFORM > Webhooks**, select event types such as `v1.conversation.created` and `v1.conversation.ended`, then start a conversation with your AI Agent.

## Notes

- The route uses `express.raw()`. The signature covers the exact raw body bytes, so `express.json()` before verification breaks it.
- If `ADA_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- Ada payloads have no top-level event ID. The handler dedupes on the `svix-id` header, which stays the same across retries.
- Ada needs a `2xx` within **15 seconds**. Enqueue the event and process it asynchronously in production.
