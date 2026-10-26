# Setting Up Katana Webhooks

Katana webhooks are registered through the public API, not a dashboard form.

## Prerequisites

- A Katana account with an API key (Bearer token)
- A public HTTPS endpoint (use `npx hookdeck-cli listen 3000 katana --path /webhooks/katana` for local development)

## Create the Webhook and Get Your Signing Token

```bash
curl -X POST https://api.katanamrp.com/v1/webhooks \
  -H "Authorization: Bearer $KATANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/webhooks/katana",
    "subscribed_events": ["sales_order.created", "purchase_order.received", "manufacturing_order.done"]
  }'
```

The response includes a `token` field (for example `73f82127d57a2cea`). **Each webhook has its own token.**
Store it as `KATANA_WEBHOOK_SECRET`. It is the HMAC key, used as its UTF-8 string: do not hex-decode it.

If you create several webhooks pointing at one endpoint, you need to know which token signed each delivery
(use one URL per webhook, or try each token).

## Using Hookdeck

Hookdeck's Katana MRP source (type `KATANA`) verifies `x-sha2-signature` as hex HMAC-SHA256. Paste the webhook's
`token` as the signing secret. The source pre-selects POST without managing the method, so if Katana sends
another method, allow it on the source.

## Test

Create a sales order in Katana (or update a product) and check your endpoint receives the delivery. Katana
expects a 20X within 10 seconds.

## Subscribing Tips

- Subscribe to only the events you need.
- A status event (for example `sales_order.delivered`) and the matching `sales_order.updated` can both fire, so
  you may receive two identical payloads. Make the handler idempotent.
