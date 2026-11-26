# Runa Webhooks Overview

## What Are Runa Webhooks?

[Runa](https://runa.io) is a payouts network for gift cards, prepaid cards and push-to-card.
Webhooks push order outcomes, fraud-blocked payout links and product-catalog changes to an HTTPS endpoint you add in the
Svix webhook portal, so you don't have to poll the Orders or Products APIs. Runa delivers them
through Svix, and every delivery is signed (see [verification.md](verification.md)).

| Aspect | Value |
|--------|-------|
| Method | `POST`, JSON body |
| Signature headers | `svix-id`, `svix-timestamp`, `svix-signature` (Standard Webhooks) |
| Success | Any `2xx` within 15 seconds. Runa's docs ask for `200`; queue slow work instead of doing it inline |
| Retries | Svix schedule: immediately, 5 s, 5 min, 30 min, 2 h, 5 h, 10 h, 10 h |
| Disabled endpoints | An endpoint that fails every attempt for 5 days is disabled and must be re-enabled in the portal |
| Ordering | Not guaranteed (documented on the `product.update` page) |

## Common Event Types

Runa documents five event types. Its webhooks page says each endpoint subscribes to a single
event type in the portal; its November 2026 changelog says the new events can be added to an
existing endpoint's event types.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `order.completed` | An order finishes processing successfully | Fulfil async orders, record order data |
| `order.failed` | An order fails, with a `reason` of `fraud` or `generic` | Alert on failures, handle fraud blocks |
| `payout.blocked` | Runa's fraud checks block a recipient from redeeming a payout link | Tell the recipient, contact Runa with the `assessment_id` |
| `order.completion` | An order has finished processing, whether it completed or failed (older; Runa recommends the two order events above for new integrations) | Fulfil async orders, alert on failures |
| `product.update` | A product in the catalog is added, updated or removed (one event per product) | Enable or disable products, refresh pricing and denominations |

The list may not be exhaustive; check the
[webhooks reference](https://developer.runa.io/reference/webhooks) for additions.

## Event Payload Structure

`order.completed`, `order.failed` and `payout.blocked` use the Standard Webhooks envelope: the
event name is in `type`, the time in `timestamp` and the details in `data`. `order.completion`
and `product.update` are **bare resources** with no envelope and no field naming the event.

### order.failed

Runa's printed example:

```json
{
  "type": "order.failed",
  "timestamp": "2024-01-03T14:25:07Z",
  "data": {
    "id": "O-01HK7VK8C3WM1MQ916GEXJGQ6P",
    "status": "FAILED",
    "reason": "fraud"
  }
}
```

### order.completed

`data` holds the order in the same shape as the completed `order.completion` body. Runa prints
no whole example.

### payout.blocked

`data` holds `order_item_id`, `order_id`, `assessment_id` (quote it when you contact Runa) and
`cancelled`. When `cancelled` is `false`, the link is still active but its redemptions keep
being blocked.

### order.completion

The `status` field selects the payload. It tells you the outcome of the order, not which event
this is. `status: "COMPLETED"` carries the order summary (the OpenAPI `OrderSummary` requires
`id`, `status`, `created_at`, `payment_method`, `currency`, `total_price` and
`total_discount`). `status: "FAILED"` carries only `id` and `status`. Runa prints no whole
example of either; look the order up through the Orders API for anything beyond that.

### product.update

From Runa's [Real-time catalog updates](https://developer.runa.io/features/realtime-product-updates) guide:

```json
{
  "product_code": "XYZ-US",
  "old_state": {
    "price_multiplier": "0.0098",
    "is_orderable": true,
    "denominations": {
      "type": "fixed",
      "available_list": ["10", "25", "50"],
      "minimum_value": "10.0",
      "maximum_value": "50.0"
    }
  },
  "new_state": {
    "price_multiplier": "0.0098",
    "is_orderable": false,
    "denominations": {
      "type": "fixed",
      "available_list": ["10", "25", "50"],
      "minimum_value": "10.0",
      "maximum_value": "50.0"
    }
  },
  "timestamp": "2025-08-26T18:39:27.006833+00:00"
}
```

| Field | Meaning |
|-------|---------|
| `product_code` | Identifies the product that changed |
| `old_state` / `new_state` | The product before and after: `price_multiplier`, `is_orderable`, and optional `denominations` |
| `timestamp` | UTC ISO 8601 time of the update |

What to do with the changes:

| Change | Action |
|--------|--------|
| `is_orderable` becomes `false` | Disable the product; orders for it (or for a removed denomination) are rejected |
| `is_orderable` becomes `true` | Enable the product again |
| `price_multiplier` changes | Update pricing and discounts in your catalog |

## Delivery Rules Worth Planning For

- **Verify before acting.** Keep signature verification ahead of any fulfilment or state change.
- **Don't rely on order.** Store the `timestamp` per `product_code` and discard `product.update`
  events older than the last one you received.
- **Deduplicate side effects.** Svix retries and manual resends repeat a message with the same
  `svix-id`. Key order handling on the order `id` plus the event.
- **Acknowledge unknown payloads with `200`.** Otherwise Svix keeps retrying them.
- **Respond within 15 seconds.** Queue slow work and return `200` straight away.
- **Recover from downtime.** Resend a single message from the portal, or use **Options > Recover
  Failed Messages** on the endpoint to replay everything since a given time.

## Full Reference

See Runa's [webhooks](https://developer.runa.io/reference/webhooks) page, plus the
[order.completed](https://developer.runa.io/reference/2024-02-05/webhook/order.completed),
[order.failed](https://developer.runa.io/reference/2024-02-05/webhook/order.failed),
[payout.blocked](https://developer.runa.io/reference/2024-02-05/webhook/payout.blocked),
[order.completion](https://developer.runa.io/reference/2024-02-05/webhook/order.completion) and
[product.update](https://developer.runa.io/reference/2024-02-05/webhook/product.update) references.
