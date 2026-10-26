# Setting Up Ventrata Webhooks

> Ventrata webhooks are not signed. Add a secret header when you create the webhook through the OCTO API and enter it here.

## Prerequisites

- A Ventrata API connection that can use the `octo/webhooks` capability
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 ventrata --path /webhooks/ventrata` locally)

## Choose Your Secret Header

Webhooks are created through the API, not a dashboard form, and you pick the credential yourself.
The `whsec_...` style value in Ventrata's example is just a string the user chose; it is not a
signing secret.

1. Pick a header name, e.g. `X-Webhook-Secret`. Store it as `VENTRATA_WEBHOOK_HEADER`.
2. Generate a long random value, e.g. `openssl rand -hex 32`. Store it as `VENTRATA_WEBHOOK_SECRET`.
   If you type a prefix such as `Bearer `, it is part of the value: Ventrata sends it, and you
   must store the whole thing.

## Register Your Endpoint

Add `octo/webhooks` to the `Octo-Capabilities` header, then create the webhook:

```bash
curl -X POST https://api.ventrata.com/octo/webhooks \
  -H "Content-Type: application/json" \
  -H "Octo-Capabilities: octo/webhooks" \
  -H "Authorization: Bearer $VENTRATA_API_KEY" \
  -d '{
    "event": "booking.updated",
    "url": "https://example.com/webhooks/ventrata",
    "headers": { "X-Webhook-Secret": "your-secret-value" },
    "retryOnError": true
  }'
```

- `event`: `booking.updated` in the API examples; the capability lists `order_update`,
  `booking_update`, `availability_update` and `product_update`. Create one webhook per event.
- `headers`: sent on every delivery. This is where the secret header goes.
- `retryOnError`: whether failed deliveries are retried.
- `useContactLanguage` is optional.

Use the same API key and base URL you use for your other OCTO calls; adjust the `Authorization`
line to match your connection.

Manage webhooks with `PATCH /octo/webhooks/{webhookId}` (all fields optional),
`GET /octo/webhooks`, `DELETE /octo/webhooks/{webhookId}`, or `DELETE /octo/webhooks` with
`{url, event}` to delete by URL.

## Test

Replay a delivery with curl:

```bash
curl -X POST http://localhost:3000/webhooks/ventrata \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $VENTRATA_WEBHOOK_SECRET" \
  -d '{"event":"booking.updated","webhook":{"id":"webhook_booking_update"},"booking":{"uuid":"89fe0192-ddcd-430a-b285-e1396a4725d2","status":"ON_HOLD"}}'
```

## Rotating the Secret

`PATCH` the webhook with the new `headers` map, then update `VENTRATA_WEBHOOK_SECRET`. Rotate
whenever the value may have leaked: there is no signature or timestamp to limit the damage.
