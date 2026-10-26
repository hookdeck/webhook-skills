# Ventrata Webhooks - Next.js Example

Minimal example of receiving Ventrata OCTO webhooks and authenticating them with a secret header
in a Next.js App Router route.

Ventrata webhooks are not signed, so there is no HMAC to verify. You add a secret header in the
webhook's `headers` map when you create it through the OCTO API. The route compares that header
(name from `VENTRATA_WEBHOOK_HEADER`, value from `VENTRATA_WEBHOOK_SECRET`) in constant time. This
authenticates the sender, not the body, and gives no replay protection, so use HTTPS and rotate the
secret if it leaks. The body is read with `request.text()`, so any content type works.

## Prerequisites

- Node.js 18+
- A Ventrata OCTO API connection with the `octo/webhooks` capability (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `VENTRATA_WEBHOOK_HEADER` to the header name and `VENTRATA_WEBHOOK_SECRET` to the exact,
   whole header value you put in the webhook's `headers` map (including any `Bearer ` prefix).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/ventrata`.

## Test

```bash
npm test
```

The tests send every event (in both `booking_update` and `booking.updated` forms) with correct,
wrong and missing secrets. No Ventrata account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/ventrata \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $VENTRATA_WEBHOOK_SECRET" \
  -d '{"event":"booking.updated","webhook":{"id":"webhook_booking_update"},"booking":{"uuid":"89fe0192-ddcd-430a-b285-e1396a4725d2","status":"ON_HOLD"}}'
```

## Receive Webhooks Locally

Ventrata can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 ventrata --path /webhooks/ventrata
```

Use the printed URL as the webhook `url` when you create the webhook.

## How It Works

- `lib/verify-ventrata.ts`: `verifyVentrataRequest()` and `normalizeEvent()`
- `app/webhooks/ventrata/route.ts`: the `POST` handler

1. The secret header is checked before the body is read. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on `event`, accepting both forms: `order_update` / `order.updated`,
   `booking_update` / `booking.updated`, `availability_update` / `availability.updated`,
   `product_update` / `product.updated`.
4. It returns `200 {"received": true}`.
