# epilot Webhooks - Express Example

Minimal example of receiving [epilot](https://www.epilot.cloud) webhooks with signature verification. epilot signs deliveries per Standard Webhooks, so the handler verifies the `webhook-id`, `webhook-timestamp` and `webhook-signature` headers with the [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) package. The `v1a` Ed25519 entry is skipped and the `v1` HMAC entry is verified.

## Prerequisites

- Node.js 18+
- An epilot organization with a webhook config
- The webhook's `whsec_...` signing secret, returned only when the webhook is created

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put the webhook's signing secret in `EPILOT_WEBHOOK_SECRET` (see [setup](../../references/setup.md)). Use the `whsec_` secret, not an API key, Basic or OAuth credential. Each webhook has its own secret.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. The endpoint `/webhooks/epilot` accepts `GET`, `POST`, `PUT`, `PATCH` and `DELETE` (each epilot webhook config sets its own `httpMethod`; Hookdeck's epilot source pre-selects POST without managing it, so allow any other method on the source too).

## Test

```bash
npm test
```

The tests sign payloads the way epilot does (`v1a,<Ed25519> v1,base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{webhook-id}.{webhook-timestamp}.{raw body}"))`). They cover tampered bodies, `v1a`-only headers, stale timestamps, multiple signatures, another webhook's secret, retried deliveries, svix-* header fallback, every method, a bodiless GET and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 epilot --path /webhooks/epilot
```

Use the printed URL as the webhook URL in epilot, then trigger the event (for example an automation with a webhook action).

## Notes

- The route uses `express.raw({ type: '*/*' })`, so any content type works and the exact bytes are verified. `express.json()` before verification breaks the signature. The body is parsed only after the check.
- If `EPILOT_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- The library enforces a fixed 5-minute timestamp window. epilot retries and Hookdeck replays resend the original timestamp, so late ones are rejected. For a wider or no window, use the manual verifier in [verification.md](../../references/verification.md).
- `binary_multipart` file deliveries sign per-file metadata and fail verification here.
- The handler dedupes on `webhook-id`, which stays the same across retries. The in-memory set is a demo; use Redis or a database in production.
