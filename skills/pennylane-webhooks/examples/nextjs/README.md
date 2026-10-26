# Pennylane Webhooks - Next.js Example

Minimal example of receiving Pennylane webhooks with `X-Pennylane-Signature` verification.

## Prerequisites

- Node.js 18+
- Pennylane API access with the `companies:webhook_subscriptions:all` scope, and a webhook subscription created through the API so you have its `secret`

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the subscription `secret` to `.env` (`PENNYLANE_WEBHOOK_SECRET`). Pennylane returns it only once, in the create-subscription response.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

The handler reads the raw body with `request.text()`, verifies `X-Pennylane-Signature` (`t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`, any one of several `v1` values may match), then dispatches on the body's `event` (`customer_invoice.e_invoicing_status_updated`, `dms_file.created`, `supplier_invoice.e_invoicing_received`). A bad signature returns 400: Pennylane disables a subscription immediately on 401, 403, 404 or 410. The timestamp check is off by default because Hookdeck retries and replays keep the original timestamp; set `PENNYLANE_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 pennylane --path /webhooks/pennylane
```

Use the Hookdeck URL as the `callback_url` when you create the subscription (it must be HTTPS).
