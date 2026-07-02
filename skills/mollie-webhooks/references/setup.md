# Setting Up Mollie Webhooks

## Prerequisites

- A [Mollie](https://www.mollie.com) account
- Your application's publicly reachable webhook endpoint URL

## Get Your API Key

Mollie webhooks use your regular **API key** for both creating payments and
fetching them in the webhook handler. There is no separate webhook signing
secret.

1. Log in to the [Mollie Dashboard](https://my.mollie.com).
2. Go to **Developers → API keys**.
3. Copy the **Test API key** (`test_…`) for development, or the **Live API key**
   (`live_…`) for production.

Put it in your environment:

```bash
MOLLIE_API_KEY=test_xxxxx
```

Test and live keys are fully separate — a test key only sees test payments.

## Register Your Endpoint

Unlike most providers, Mollie has **no dashboard field for a global payments
webhook**. Instead you set the `webhookUrl` **per payment** when you create it via
the API:

```javascript
const { createMollieClient } = require('@mollie/api-client');
const mollie = createMollieClient({ apiKey: process.env.MOLLIE_API_KEY });

const payment = await mollie.payments.create({
  amount: { currency: 'EUR', value: '10.00' },
  description: 'Order #12345',
  redirectUrl: 'https://example.com/order/12345',
  webhookUrl: 'https://example.com/webhooks/mollie', // ← Mollie will POST here on status change
  metadata: { order_id: '12345' },                   // ← reconcile this in your handler
});

// Redirect the customer to complete payment:
// payment.getCheckoutUrl()
```

Notes:

- The `webhookUrl` **must be publicly reachable** — `localhost` will not work.
  Use a tunnel (see below) during development.
- Some resources (subscriptions, refunds via profiles) also accept a
  `webhookUrl`; the same fetch-to-confirm handler applies.
- There is **no** "select events" step — Mollie always notifies you on every
  status change for that resource.

## Local Development

Mollie must reach your handler over the public internet. Use the Hookdeck CLI to
tunnel to your local server — no install, no account:

```bash
npx hookdeck-cli listen 3000 mollie --path /webhooks/mollie
```

Use the public URL it prints as the `webhookUrl` when creating a payment.

## Test Mode vs Live Mode

- Use the **test** API key (`test_…`) and create test payments. Mollie's test
  checkout lets you pick the resulting status (paid, failed, expired, etc.), which
  triggers the corresponding webhook call.
- Switch to the **live** API key (`live_…`) for production. The handler code is
  identical — only the key changes.

## Retries

If your endpoint does not return **HTTP 200**, Mollie retries the webhook with
exponential backoff for roughly **26 hours**. Always return `200` once you have
accepted the call (including for unknown ids); return a non-200 only when you want
Mollie to retry (e.g. the Mollie API was temporarily unreachable when you tried to
fetch the payment).
