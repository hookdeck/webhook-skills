# Codat Webhooks - Next.js Example

Minimal Next.js App Router example of receiving [Codat](https://www.codat.io) webhooks with signature verification. Codat delivers webhooks through Svix, so the route verifies the `webhook-id`, `webhook-timestamp` and `webhook-signature` (Standard Webhooks names, not `svix-*`) headers with the [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) package (the Svix-maintained reference implementation of the same scheme).

## Prerequisites

- Node.js 18+
- A Codat account with access to the Codat Portal (**Monitor > Webhooks**)
- The signing secret (`whsec_...`) of your webhook endpoint

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Put your endpoint's signing secret in `CODAT_WEBHOOK_SECRET`. Copy it from the Codat Portal: **Monitor > Webhooks > Events**, click the endpoint, copy the **Signing secret** (see [setup](../../references/setup.md)). Each endpoint has its own secret.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/codat` ([app/webhooks/codat/route.ts](app/webhooks/codat/route.ts)).

## Test

```bash
npm test
```

The tests call the route handler directly with real Standard Webhooks signatures. They cover tampered bodies, stale timestamps, multiple signatures, another endpoint's secret, retried deliveries, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 codat --path /webhooks/codat
```

Add the printed URL as an endpoint in the Codat Portal (**Monitor > Webhooks > Events**) and select event types such as `company.created`, `connection.connected` and `read.completed`.

## Notes

- The handler reads `await request.text()`. The signature covers the exact raw body, so calling `request.json()` before verification breaks it.
- If `CODAT_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
-  The handler dedupes on the `webhook-id` header, which stays the same across retries.
- Return a `2xx` quickly. Enqueue the event and process it asynchronously in production.
