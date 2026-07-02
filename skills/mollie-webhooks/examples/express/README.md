# Mollie Webhooks - Express Example

Minimal example of receiving Mollie webhooks with Express using the
**fetch-to-confirm** pattern.

Mollie webhooks are **not signed**. Mollie POSTs an
`application/x-www-form-urlencoded` body with a single `id` (e.g. `tr_xxx`) and no
status. This handler fetches the payment from the Mollie API with your API key and
acts on the authoritative status it returns.

## Prerequisites

- Node.js 18+
- A Mollie account and API key (`test_…` or `live_…`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Mollie API key to `.env`:
   ```bash
   MOLLIE_API_KEY=test_xxxxx
   ```

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and the webhook endpoint is
`POST http://localhost:3000/webhooks/mollie`.

## Receive Webhooks Locally

Mollie must reach your handler over the public internet. Tunnel with the Hookdeck
CLI (no install, no account):

```bash
npx hookdeck-cli listen 3000 mollie --path /webhooks/mollie
```

Use the public URL it prints as the `webhookUrl` when you create a payment:

```javascript
await mollie.payments.create({
  amount: { currency: 'EUR', value: '10.00' },
  description: 'Order #12345',
  redirectUrl: 'https://example.com/return',
  webhookUrl: 'https://<your-hookdeck-url>/webhooks/mollie',
  metadata: { order_id: '12345' },
});
```

Complete the test checkout and choose a result (paid/failed/expired) to trigger
the webhook.

## Test

```bash
npm test
```

The tests inject a fake payment fetcher, so they run without hitting the Mollie
API. They cover: missing id (400), unknown id (200), a failed fetch (500 so Mollie
retries), and dispatch for every payment status.

## How It Works

1. Mollie POSTs `id=tr_xxx` (form-urlencoded, unsigned).
2. The handler reads `id` and calls `GET /v2/payments/{id}` via
   `@mollie/api-client` with your API key.
3. It dispatches on the fetched `payment.status` and returns `200`.
4. Unknown ids return `200`; a transient fetch failure returns `500` so Mollie
   retries (for ~26 hours).
