# Yoco Webhooks - Express Example

Minimal example of receiving [Yoco](https://www.yoco.com) webhooks with Standard Webhooks signature verification, using the [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) package that Yoco recommends. It handles events from both the **Yoco API** (`event_type`, e.g. `payment.created`) and the **Checkout API** (`type`, e.g. `payment.succeeded`).

## Prerequisites

- Node.js 18+
- A Yoco account with an API key (Yoco API) or secret key (Checkout API)
- The `whsec_...` secret returned when you created the webhook subscription (it's shown only once, see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put the subscription secret in `YOCO_WEBHOOK_SECRET`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/yoco`.

## Test

```bash
npm test
```

The tests sign payloads with Yoco's algorithm (`base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{webhook-id}.{webhook-timestamp}.{raw body}"))`). They cover Yoco API and Checkout API events, tampered bodies, timestamps outside the 3-minute window, multiple signatures, duplicate `webhook-id`s, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 yoco --path /webhooks/yoco
```

Use the printed URL as the `notification_url` (Yoco API) or `url` (Checkout API) when you create the subscription. With the Yoco API you can then send a sample event with `POST /v1/webhooks/subscriptions/{subscription_id}/test`.

## Notes

- The route uses `express.raw()`. The signature covers the exact raw body bytes, so running `express.json()` before verification breaks it.
- The handler rejects timestamps more than 3 minutes from the server clock, as Yoco recommends. The `standardwebhooks` SDK on its own allows 5 minutes.
- If `YOCO_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- Yoco needs a `2xx` within **15 seconds**. Enqueue the event and process it asynchronously in production.
- Checkout API webhooks fire for every payment on the account. Match `payload.metadata.checkoutId` against the checkout you created before fulfilling an order.
