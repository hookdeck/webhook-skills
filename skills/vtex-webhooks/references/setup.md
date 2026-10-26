# Setting Up VTEX Webhooks

## Prerequisites

- A VTEX account and an API key (appKey/appToken) whose role includes **Feed v3 and Hook Admin**
  (Order Management)
- A publicly reachable HTTPS endpoint (locally: `npx hookdeck-cli listen 3000 vtex --path /webhooks/vtex`)
- Your endpoint must already be running and return `200` to `{"hookConfig": "ping"}`

## Pick a Secret

VTEX doesn't generate one. Make up a long random value and store it as `VTEX_WEBHOOK_SECRET`. Choose
the header name (default in these examples: `X-Webhook-Secret`) and store it as `VTEX_WEBHOOK_HEADER`.

The value is compared **in full**. If you configure `"Authorization": "Bearer abc"`, set
`VTEX_WEBHOOK_SECRET="Bearer abc"` and `VTEX_WEBHOOK_HEADER=Authorization`.

## Configure the Hook

Call **Create or update hook configuration** on the Orders API. Hooks are configured by API only.

```bash
curl -X POST "https://{accountName}.{environment}.com.br/api/orders/hook/config" \
  -H "Content-Type: application/json" \
  -H "X-VTEX-API-AppKey: $VTEX_APP_KEY" \
  -H "X-VTEX-API-AppToken: $VTEX_APP_TOKEN" \
  -d '{
    "filter": { "type": "FromWorkflow", "status": ["payment-approved", "ready-for-handling", "invoiced", "canceled"] },
    "hook": {
      "url": "https://example.com/webhooks/vtex",
      "headers": { "X-Webhook-Secret": "your-secret-value" }
    }
  }'
```

Check the endpoint path and hostname against the Orders API reference for your account. The `filter`
works like the feed filter: `FromWorkflow` with a `status` list, or `FromOrders` with a JSONata
`expression`.

VTEX pings the URL while saving. If the endpoint doesn't return `200`, you get `400` and the hook is
not saved.

## Keep the Hook Alive

- One hook per `appKey`; configuring again replaces it.
- With no notifications for three days VTEX deletes the hook. Check it with **Get hook
  configuration** and re-create it when needed, so keep the filter broad enough to fire.
- Failed deliveries are retried with growing intervals; respond `200` within 5000 ms.

## Test

Replay a notification with curl:

```bash
curl -X POST http://localhost:3000/webhooks/vtex \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $VTEX_WEBHOOK_SECRET" \
  -d '{"Domain":"Marketplace","OrderId":"v40484048naf-01","State":"payment-approved","LastChange":"2019-07-29T23:17:30.0617185Z","Origin":{"Account":"accountABC","Key":"vtexappkey-keyEDF"}}'
```

## Rotating the Secret

Call the hook configuration endpoint again with the new header value and update `VTEX_WEBHOOK_SECRET`
at the same time. Notifications sent in between will get `401` and be retried by VTEX.
