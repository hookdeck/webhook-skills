# Setting Up Yoco Webhooks

Yoco has no dashboard screen for webhooks. You create subscriptions through the API, and the signing secret is in the creation response **only**.

## Prerequisites

- A Yoco account
- **Yoco API:** an access token with the `application/webhooks:read` and `application/webhooks:write` scopes (plus `business/orders:read` to receive payment and order events)
- **Checkout API:** your secret key (`sk_live_...` or `sk_test_...`)
- A public HTTPS endpoint with a valid TLS certificate (self-signed certificates aren't supported). For local development, use the Hookdeck CLI tunnel below.

## Which API Should I Use?

- Building on the **Yoco API** (POS and online payments, orders, catalogue)? Use [Option A](#option-a-yoco-api-subscription).
- Using **hosted checkout pages** (`payments.yoco.com`)? Use [Option B](#option-b-checkout-api-webhook).

Both deliver the same `webhook-*` headers and verify identically.

## Option A: Yoco API Subscription

```bash
curl -X POST https://api.yoco.com/v1/webhooks/subscriptions/ \
  -H "Authorization: Bearer $YOCO_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production webhook",
    "notification_url": "https://your-app.com/webhooks/yoco",
    "event_types": ["payment.created", "payment.refunded", "order.completed"]
  }'
```

Use `https://api.yocosandbox.com` instead of `https://api.yoco.com` for sandbox testing.

The `201` response includes a `secret` beginning with `whsec_`. **Store it now** as `YOCO_WEBHOOK_SECRET`; later reads of the subscription return `secret: null`.

Other subscription endpoints:

| Action | Endpoint |
|--------|----------|
| List available event types | `GET /v1/webhooks/events/` |
| List / fetch subscriptions | `GET /v1/webhooks/subscriptions/`, `GET /v1/webhooks/subscriptions/{id}` |
| Update (URL, events, re-enable) | `PATCH /v1/webhooks/subscriptions/{id}` |
| Rotate the secret | `POST /v1/webhooks/subscriptions/{id}/secret` (returns the new `secret`) |
| Send a test event | `POST /v1/webhooks/subscriptions/{id}/test` with `{"event_type": "payment.created"}` |
| Delete | `DELETE /v1/webhooks/subscriptions/{id}` |

## Option B: Checkout API Webhook

```bash
curl -X POST https://payments.yoco.com/api/webhooks \
  -H "Authorization: Bearer $YOCO_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-webhook",
    "url": "https://your-app.com/webhooks/yoco"
  }'
```

The `201` response returns `id`, `mode` (`live` or `test`, depending on the key you used), and a `secret` (`whsec_...`) that is **shown only once**.

- You can't choose events. All payment and refund events for the account are sent.
- There's a limit of 5 webhooks per account, and Yoco recommends registering only one. Remove extras with `DELETE /api/webhooks/{id}` (`GET /api/webhooks` lists them).
- There's no rotate endpoint. If you lose the secret, delete the webhook and register a new one.

## Local Development

Run the Hookdeck CLI (no account or install required) to get a public URL that forwards to your local server:

```bash
# Express / Next.js
npx hookdeck-cli listen 3000 yoco --path /webhooks/yoco

# FastAPI
npx hookdeck-cli listen 8000 yoco --path /webhooks/yoco
```

Use the printed URL as `notification_url` (Yoco API) or `url` (Checkout API). Then:

- **Yoco API:** call the test endpoint, which delivers a signed sample event with the same retry behaviour as live events.
- **Checkout API:** create a checkout with your test secret key and pay with a test card.

Tunnel URLs change when you restart the CLI, so update the subscription before going live.

## Going Live Checklist

- [ ] `YOCO_WEBHOOK_SECRET` is in your secret manager, not in source code
- [ ] The handler verifies the signature on the **raw** body and rejects timestamps more than 3 minutes off
- [ ] The handler returns `2xx` within 15 seconds and queues slow work
- [ ] Duplicates are skipped using the `webhook-id` header
- [ ] Your framework's CSRF protection is disabled for the webhook route
- [ ] (Checkout API) Events are matched to your checkout via `payload.metadata.checkoutId`
