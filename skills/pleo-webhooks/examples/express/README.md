# Pleo Webhooks - Express Example

Minimal example of receiving [Pleo](https://www.pleo.io) webhooks with signature verification. Pleo delivers through Svix using Standard Webhooks headers, and has no webhook SDK of its own, so this example verifies with the [`standardwebhooks`](https://github.com/standard-webhooks/standard-webhooks) library.

## Prerequisites

- Node.js 18+
- A Pleo integration with an API key or OAuth access token that has read access to the API behind the events you want (for example `export-jobs:read` for export events)
- A webhook subscription and its secret (`whsec_...`). See [setup](../../references/setup.md).

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put the subscription secret in `PLEO_WEBHOOK_SECRET`. Read it with:
   ```bash
   curl https://external.pleo.io/v1/subscriptions/{subscription-id}/secret \
     -H "Authorization: Bearer $PLEO_ACCESS_TOKEN"
   # {"data":{"secretKey":"whsec_..."}}
   ```

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/pleo`.

## Test

```bash
npm test
```

The tests sign payloads the way Svix does (`base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{webhook-id}.{webhook-timestamp}.{raw body}"))`) and cover `v1.export-job.created`, `v1.vendor.created`, multiple signatures, tampered bodies, stale timestamps, retried deliveries and the fail-closed path when no secret is set.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 pleo --path /webhooks/pleo
```

Use the printed URL as `endpointUrl` when you create the subscription (`POST /v1/subscriptions`), then click **Export** in Pleo (or add a vendor) to trigger an event.

## Notes

- The route uses `express.raw()`. The signature covers the exact raw body bytes, so `express.json()` before verification breaks it.
- If `PLEO_WEBHOOK_SECRET` is unset the handler returns `500` and never accepts unverified requests.
- Pleo reuses the `webhook-id` when it retries a delivery, so the handler dedupes on it and returns `200` for duplicates.
- Pleo's docs don't state the signed content. The `{webhook-id}.{webhook-timestamp}.{body}` HMAC-SHA256 scheme is inferred from Pleo delivering through Svix.
