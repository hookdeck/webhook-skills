# Surge Webhooks - Express Example

Minimal example of receiving [Surge](https://docs.surge.app/api-reference/webhooks) webhooks with signature verification. Surge signs deliveries with [Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks), so the handler verifies the `webhook-id`, `webhook-timestamp` and `webhook-signature` headers with the [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) package. If `webhook-id` is absent it falls back to the `svix-*` headers, as Hookdeck does.

## Prerequisites

- Node.js 18+
- A Surge account with access to the project's Webhooks page
- The endpoint's signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put the endpoint's signing secret in `SURGE_WEBHOOK_SECRET`, including the `whsec_` prefix (see [setup](../../references/setup.md)). 

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/surge` ([src/index.js](src/index.js)).

## Test

```bash
npm test
```

The tests sign requests the way Surge does and cover tampered bodies, stale timestamps, multiple signatures, the `svix-*` header fallback, another endpoint's secret, duplicate events, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 surge --path /webhooks/surge
```

Add the URL the CLI prints as the endpoint on Surge's Webhooks page, then trigger an event, for example by sending a message to one of your numbers.

## Notes

- The route uses `express.raw({ type: '*/*' })`, so any content type reaches the verifier as the exact bytes Surge sent. Calling `express.json()` before verification breaks the signature.
- If `SURGE_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- The `standardwebhooks` library always enforces a 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so late ones fail. Use the manual verifier in [references/verification.md](../../references/verification.md) to drop or widen the window.
- Delivery is at-least-once. The handler dedupes on the envelope `id` (falling back to `type` + `data.id`).
- Return `2xx` quickly (Surge's timeout isn't documented). Enqueue the event and process it asynchronously in production.
