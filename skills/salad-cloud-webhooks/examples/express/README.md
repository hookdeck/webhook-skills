# SaladCloud Webhooks - Express Example

Minimal example of receiving [SaladCloud](https://docs.salad.com) Job Queue webhooks with signature verification. SaladCloud signs deliveries with [Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks), so the handler verifies the `webhook-id`, `webhook-timestamp` and `webhook-signature` headers with the [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) package. If `webhook-id` is absent it falls back to the `svix-*` headers, as Hookdeck does.

## Prerequisites

- Node.js 18+
- A SaladCloud account with a Job Queue
- The webhook secret key from the SaladCloud portal

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put the portal's webhook secret key in `SALAD_CLOUD_WEBHOOK_SECRET` exactly as shown: a bare base64 string with no `whsec_` prefix (see [setup](../../references/setup.md)). The library also accepts the `whsec_` + secret form.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/salad-cloud` ([src/index.js](src/index.js)).

## Test

```bash
npm test
```

The tests sign requests the way SaladCloud does and cover tampered bodies, stale timestamps, multiple signatures, the `svix-*` header fallback, the `whsec_`-prefixed secret form, another secret's signature, duplicate `webhook-id`s, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 salad-cloud --path /webhooks/salad-cloud
```

Set the `webhook` field of a Job Queue job to the URL the CLI prints, submit the job, and wait for it to succeed. A `queue.job.succeeded` event arrives.

## Notes

- The route uses `express.raw({ type: '*/*' })`, so any content type reaches the verifier as the exact bytes SaladCloud sent. Calling `express.json()` before verification breaks the signature.
- If `SALAD_CLOUD_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- The `standardwebhooks` library always enforces a 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so late ones fail. Use the manual verifier in [references/verification.md](../../references/verification.md) to drop or widen the window.
- When you configure a Hookdeck source, paste the secret as `whsec_` followed by the portal secret: "SaladCloud shows the secret without a prefix. Paste it as whsec_ followed by the secret, or verification fails."
- The body has no event id, so the handler dedupes on the `webhook-id` header.
