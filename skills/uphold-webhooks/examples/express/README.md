# Uphold Webhooks - Express Example

Minimal example of receiving [Uphold Enterprise](https://developer.uphold.com/rest-apis/webhooks) (Core API) webhooks with signature verification, using the official [`svix`](https://www.npmjs.com/package/svix) package. Uphold delivers webhooks through Svix and points to Svix's verification guide and SDKs.

## Prerequisites

- Node.js 20.19+ (`svix` 2.x is ESM-only, so this example uses ES modules)
- An Uphold Enterprise account (Sandbox or Production)
- The endpoint's signing secret (`whsec_...`) from the Webhooks Portal

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your endpoint's signing secret to `UPHOLD_WEBHOOK_SECRET` (see [setup](../../references/setup.md) for where to find it).

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/uphold`.

## Test

```bash
npm test
```

The tests sign payloads the same way Uphold does (`base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{webhook-id}.{webhook-timestamp}.{raw body}"))`). They cover tampered bodies, stale timestamps, multiple signatures, `svix-*` header names, duplicate deliveries, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 uphold --path /webhooks/uphold
```

Add the printed URL as an endpoint in the Webhooks Portal, subscribe to events such as `core.user.created` and `core.transaction.status-changed`, and send a test event from the portal. In Sandbox you can also trigger real events with Uphold's [test helpers](https://developer.uphold.com/rest-apis/test-helpers).

## Notes

- The route uses `express.raw()`. The signature covers the exact raw body bytes, so `express.json()` before verification breaks it.
- In `svix` 2.x, `Webhook.verify()` returns `undefined` and only throws on failure. The handler parses the raw body with `JSON.parse` after verification.
- If `UPHOLD_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- Failed deliveries are retried with exponential backoff for up to 24 hours. Dedupe on the event `id` (or the `webhook-id` header) and acknowledge quickly.
