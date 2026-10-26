# Velt Webhooks - Express Example

Minimal example of receiving [Velt](https://docs.velt.dev/webhooks/advanced) Advanced (V2) webhooks with signature verification. Velt signs these with [Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks), so the handler verifies the `webhook-id`, `webhook-timestamp` and `webhook-signature` headers with the [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) package. If `webhook-id` is absent it falls back to the `svix-*` headers, as Hookdeck does.

## Prerequisites

- Node.js 18+
- A Velt Enterprise account with Advanced webhooks in the Velt console (Basic V1 webhooks are unsigned)
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

3. Put the endpoint's signing secret in `VELT_WEBHOOK_SECRET`, including the `whsec_` prefix (see [setup](../../references/setup.md)). Each endpoint has its own secret.

> "Only Velt Advanced (V2) webhooks, available on Enterprise, are signed. Basic (V1) webhooks send an auth token instead and fail verification."

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/velt` ([src/index.js](src/index.js)).

## Test

```bash
npm test
```

The tests sign requests the way Velt does and cover tampered bodies, stale timestamps, multiple signatures, the `svix-*` header fallback, another endpoint's secret, duplicate webhook ids, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 velt --path /webhooks/velt
```

Add an endpoint in the Velt console using the URL the CLI prints, then send an example event from the endpoint's Testing tab.

## Notes

- The route uses `express.raw({ type: '*/*' })`, so any content type reaches the verifier as the exact bytes Velt sent. Calling `express.json()` before verification breaks the signature.
- If `VELT_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- The `standardwebhooks` library always enforces a 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so late ones fail. Use the manual verifier in [references/verification.md](../../references/verification.md) to drop or widen the window.
- Delivery is at-least-once. The handler dedupes on the `webhook-id` header.
- Velt expects a `2xx` within **15 seconds**. Enqueue the event and process it asynchronously in production.
