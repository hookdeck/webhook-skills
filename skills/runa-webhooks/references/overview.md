# Runa Webhooks Overview

## What Are Runa Webhooks?

[Runa](https://runa.io) is a payouts network for gift cards, prepaid cards and push-to-card.
Webhooks push order completion and product-catalog changes to an HTTPS endpoint you add in the
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

Runa documents two event types. Each endpoint subscribes to **exactly one** of them in the
portal, so add one endpoint per event type you want.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `order.completion` | An order has finished processing, whether it completed or failed | Fulfil async orders, record order data, alert on failures |
| `product.update` | A product in the catalog is added, updated or removed (one event per product) | Enable or disable products, refresh pricing and denominations |

The list may not be exhaustive; check the
[webhooks reference](https://docs.runa.io/reference/webhooks) for additions.

## Event Payload Structure

Payloads are **bare resources**: there is no envelope and **no field names the event**. The
endpoint URL identifies the event, and the examples tell the two apart by shape.

### order.completion

The `status` field selects the payload. It tells you the outcome of the order, not which event
this is.

`status: "COMPLETED"` carries the order summary:

```json
{
  "id": "ord_12345",
  "status": "COMPLETED",
  "created_at": "2025-08-26T18:39:20.000000+00:00",
  "completed_at": "2025-08-26T18:39:27.006833+00:00",
  "payment_method": { "type": "ACCOUNT_BALANCE", "currency": "USD" },
  "currency": "USD",
  "total_price": "10.00",
  "total_discount": "1.00"
}
```

`status: "FAILED"` carries only the order id:

```json
{ "id": "ord_67890", "status": "FAILED" }
```

Look the order up through the Orders API for anything beyond that. The example shapes above are
abbreviated from the OpenAPI schema (`OrderSummary` requires `id`, `status`, `created_at`,
`payment_method`, `currency`, `total_price` and `total_discount`; `completed_at` and
`description` are optional).

### product.update

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
  `svix-id`. Key order handling on the order `id` plus `status`.
- **Acknowledge unknown payloads with `200`.** Otherwise Svix keeps retrying them.
- **Respond within 15 seconds.** Queue slow work and return `200` straight away.
- **Recover from downtime.** Resend a single message from the portal, or use **Options > Recover
  Failed Messages** on the endpoint to replay everything since a given time.

## Full Reference

See Runa's [webhooks](https://docs.runa.io/reference/webhooks) page, plus the
[order.completion](https://developer.runa.io/reference/2024-02-05/webhook/order.completion.md) and
[product.update](https://developer.runa.io/reference/2024-02-05/webhook/product.update.md) references.
