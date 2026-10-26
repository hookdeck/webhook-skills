# Skovik Webhooks - Express Example

Minimal example of receiving [Skovik](https://developer.skovik.com/docs/api-webhooks-receiving) webhooks with signature verification. Skovik signs deliveries with [Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks), so the handler verifies the `webhook-id`, `webhook-timestamp` and `webhook-signature` headers with the [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) package. If `webhook-id` is absent it falls back to the `svix-*` headers, as Hookdeck does.

## Prerequisites

- Node.js 18+
- A Skovik account where you can manage webhook endpoints in the settings UI
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

3. Put the endpoint's signing secret in `SKOVIK_WEBHOOK_SECRET`, including the `whsec_` prefix (see [setup](../../references/setup.md)). Each endpoint has its own secret.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/skovik` ([src/index.js](src/index.js)).

## Test

```bash
npm test
```

The tests sign requests the way Skovik does and cover tampered bodies, stale timestamps, multiple signatures, the `svix-*` header fallback, another endpoint's secret, duplicate event ids, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 skovik --path /webhooks/skovik
```

Add an HTTPS endpoint in Skovik's settings using the URL the CLI prints, then use the settings UI's test button to send a signed `misc.ping`.

## Notes

- The route uses `express.raw({ type: '*/*' })`, so any content type reaches the verifier as the exact bytes Skovik sent. Calling `express.json()` before verification breaks the signature.
- If `SKOVIK_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- The `standardwebhooks` library always enforces a 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so late ones fail. Use the manual verifier in [references/verification.md](../../references/verification.md) to drop or widen the window.
- Delivery is at-least-once. The handler dedupes on the body's `data.id` (the event id).
- Skovik times out after **5 seconds**. Enqueue the event and process it asynchronously in production.
