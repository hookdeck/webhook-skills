# Setting Up Spree Webhooks

## Prerequisites

- A Spree store (Spree 5/6) with webhooks enabled installation-wide
- Admin access, or an Admin API key (`sk_...`)
- A public HTTPS URL for your handler (use `npx hookdeck-cli listen` locally)

## Get Your Signing Secret

Spree shows the endpoint secret only once, when you create the webhook endpoint. Paste it here.

The `secret_key` is auto-generated, a 64-character hex string, and returned only in the create response. It cannot be retrieved later, so store it immediately as `SPREE_WEBHOOK_SECRET`. Use it as-is, as a string: do not hex-decode it.

## Register Your Endpoint

### Via the admin

1. Go to **Settings → Developer → Webhooks**.
2. Create an endpoint with your handler URL, set it active and choose subscriptions.
3. Copy the `secret_key` shown after creation.

### Via the Admin API

```bash
curl -X POST 'https://api.mystore.com/api/v3/admin/webhook_endpoints' \
  -H 'X-Spree-API-Key: sk_xxx' \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://example.com/webhooks/spree", "subscriptions": ["order.*", "product.updated"], "active": true}'
```

The response includes `secret_key`. Endpoints always belong to the current store. Recommended subscriptions: `order.placed`, `order.paid`, `order.canceled`, `payment.completed`, `fulfillment.fulfilled`, `user.created`, `product.updated`; prefer specific events over `*`.

## Test Your Endpoint

Call `send_test` on the endpoint (`client.webhookEndpoints.sendTest(id)` in the Admin SDK, or `POST /webhook_endpoints/{id}/send_test`) to deliver a synthetic `webhook.test` event.

For local development:

```bash
npx hookdeck-cli listen 3000 spree --path /webhooks/spree
```

(use port `8000` for the FastAPI example).

## Troubleshooting

- Not delivering: check webhooks are enabled installation-wide, the endpoint is active, it subscribes to the event, and the event belongs to the same store. A private-network host must be in `SPREE_WEBHOOKS_ALLOWED_INTERNAL_HOSTS`, otherwise deliveries fail with `has no public ip addresses`.
- Signature failing: see [verification.md](verification.md).
- Delivery records carry `error_type`, `request_errors`, `response_code` and `response_body`.
