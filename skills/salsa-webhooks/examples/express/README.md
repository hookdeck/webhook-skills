# Salsa Webhooks - Express Example

Minimal example of receiving [Salsa](https://docs.salsa.dev) (embedded payroll API) webhooks with signature verification. Salsa signs deliveries with [Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks), so the handler verifies the `webhook-id`, `webhook-timestamp` and `webhook-signature` headers with the [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) package. If `webhook-id` is absent it falls back to the `svix-*` headers, as Hookdeck does.

## Prerequisites

- Node.js 18+
- A Salsa API auth token and a webhook endpoint
- The endpoint's `signatureSecret` (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put the endpoint's `signatureSecret` in `SALSA_WEBHOOK_SECRET`, including the `whsec_` prefix. Salsa returns it when you create the endpoint (see [setup](../../references/setup.md)); contact Salsa support to rotate it.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/salsa` ([src/index.js](src/index.js)).

## Test

```bash
npm test
```

The tests sign requests the way Salsa does and cover tampered bodies, stale timestamps, multiple signatures, the `svix-*` header fallback, another endpoint's secret, the documented signing example, duplicate `webhook-id`s, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 salsa --path /webhooks/salsa
```

Create a webhook endpoint whose `endpointUrl` is the URL the CLI prints, then create or update an Employer or Worker in the sandbox.

## Notes

- The route uses `express.raw({ type: '*/*' })`, so any content type reaches the verifier as the exact bytes Salsa sent. Calling `express.json()` before verification breaks the signature.
- If `SALSA_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- The `standardwebhooks` library always enforces a 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so late ones fail. Use the manual verifier in [references/verification.md](../../references/verification.md) to drop or widen the window.
- A resent event keeps its `webhook-id`, so the handler dedupes on it. Salsa's body has no event id.
- Salsa documents no timeout. Enqueue the event and process it asynchronously in production.
