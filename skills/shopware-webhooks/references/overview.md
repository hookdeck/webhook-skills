# Shopware Webhooks Overview

## What Are Shopware Webhooks?

Shopware apps subscribe to events in a shop through `<webhook>` entries in the app manifest. When the event fires, the shop sends a `POST` with a JSON body to the URL you declared. Each request is signed with the app secret that your app assigned to that shop during registration.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `checkout.order.placed` | An order is placed | Fulfilment, ERP sync |
| `product.written` | A product is inserted or updated | Catalogue sync |
| `order.written` | An order is inserted or updated | Order sync |
| `customer.written` | A customer is inserted or updated | CRM sync |
| `state_enter.order.state.completed` | An order enters the completed state | Notifications, invoicing |
| `state_enter.order_transaction.state.paid` | A payment transaction is paid | Release goods |

Other families: `state_leave.<entity>.state.<state>`, `<entity>.deleted`, `checkout.customer.register`, `checkout.customer.login`, and more.

## Event Payload Structure

```json
{
  "data": {
    "payload": [{ "entity": "product", "operation": "update", "primaryKey": "<id>", "updatedFields": ["name"] }],
    "event": "product.written"
  },
  "source": {
    "url": "https://shop.example.com",
    "appVersion": "1.0.0",
    "shopId": "<shop id>",
    "eventId": "<unique event id>"
  },
  "timestamp": 1700000000
}
```

- `data.event` is the event name, so one endpoint can serve many events.
- For `*.written` events the payload carries only ids (`primaryKey`); fetch full entities through the shop's Admin API.
- `source.eventId` (Shopware 6.4.11.0+) stays the same when delivery is retried.
- `timestamp` is part of the signed body.

## Full Event Reference

See the [Webhook Event Reference](https://developer.shopware.com/docs/resources/references/app-reference/webhook-events-reference.html) and the [Webhook guide](https://developer.shopware.com/docs/guides/plugins/apps/webhook.html).
