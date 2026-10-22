# Setting Up Unit Webhooks

## Prerequisites

- A Unit org with Dashboard access (sandbox or live)
- A public HTTPS endpoint, e.g. `https://api.example.com/webhooks/unit`
- Optional: an API token with the `webhooks-write` scope to create webhooks via API

## Create a Webhook and Token

1. In the Unit Dashboard, open **Webhooks** from the top menu (Developer section) and click **Create**.
2. Fill in the label, URL, **token**, content type and delivery mode.
3. Store the token as `UNIT_WEBHOOK_TOKEN` in your server environment.

Or with the API:

```bash
curl -X POST 'https://api.s.unit.sh/webhooks' \
  -H 'Content-Type: application/vnd.api+json' \
  -H "Authorization: Bearer ${TOKEN}" \
  --data-raw '{
    "data": {
      "type": "webhook",
      "attributes": {
        "label": "my webhook",
        "url": "https://api.example.com/webhooks/unit",
        "token": "MyToken",
        "contentType": "JsonAPI",
        "deliveryMode": "AtLeastOnce",
        "subscriptionType": "All"
      }
    }
  }'
```

`label`, `url`, `token`, `contentType` (`Json` or `JsonAPI`) and `deliveryMode`
(`AtMostOnce` or `AtLeastOnce`) are required. The `token` is the HMAC key.

## Test Mode vs Live Mode

Sandbox (`api.s.unit.sh`) and live have separate webhooks and tokens. Sandbox
allows at most 100 enabled webhooks. Use [webhook.site](https://webhook.site) or
`npx hookdeck-cli listen 3000 unit --path /webhooks/unit` to inspect deliveries.
You can resend a past event (within 90 days) with `POST /events/{eventId}`.
