# RevenueCat Webhooks - Express Example

Minimal example of receiving RevenueCat webhooks, verifying the optional `X-RevenueCat-Webhook-Signature` HMAC and/or the static `Authorization` header you configure on the integration.

## Prerequisites

- Node.js 18+
- A RevenueCat project on a plan with webhooks, and a webhook integration with an Authorization header value and/or HMAC signing enabled (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set at least one of:
   - `REVENUECAT_WEBHOOK_SECRET` — the HMAC signing secret (shown once when you enable **HMAC webhook signing** or rotate it)
   - `REVENUECAT_WEBHOOK_AUTH` — the exact Authorization header value you entered on the integration (e.g. `Bearer <token>`)

   When both are set, both checks must pass.

## Run

```bash
npm start
```

Server runs on http://localhost:3000.

## Test

### Run unit tests

```bash
npm test
```

The tests sign payloads with the real algorithm (HMAC-SHA256 hex over `<t>.<raw body>`) and cover Authorization-only, signature-only and combined modes, malformed headers, stale timestamps, tampered and re-serialised bodies, and every documented event type.

### Forward live events with the Hookdeck CLI

```bash
# No account required — first run prints a public URL
npx hookdeck-cli listen 3000 revenuecat --path /webhooks/revenuecat
```

Use the printed URL as the webhook URL on your RevenueCat integration, then click **Send test event**. You should see a `TEST` event logged and a `200` response.

## Endpoint

- `POST /webhooks/revenuecat` — checks `Authorization` and/or `X-RevenueCat-Webhook-Signature` (401 on failure), then routes on `event.type`. Always returns `200` on success: RevenueCat treats any other status as a failure.
- `GET /health` — liveness probe.
