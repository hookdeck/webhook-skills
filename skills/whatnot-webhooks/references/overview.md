# Whatnot Webhooks Overview

## What Are Whatnot Webhooks?

Whatnot sends webhooks so your app can react to orders, shows, shipments,
show merchandising and product changes for the sellers who installed it,
without polling the API. Deliveries are signed with Standard Webhooks (see
[verification.md](verification.md)).

Sources: [Webhooks guide](https://developers.whatnot.com/getting-started/webhooks)
and the per-topic reference, which is generated from Whatnot's webhooks
[OpenAPI description](https://developers.whatnot.com/webhooks/openapi.json).

## Envelope

```json
{
  "type": "shows.started",
  "timestamp": "2026-10-20T16:00:00.123Z",
  "data": { "show_id": "9b2f6c1e-4d3a-4f8b-a1c2-3d4e5f6a7b8c" },
  "version": "v2",
  "seller_id": "1234567"
}
```

| Field | Meaning |
|---|---|
| `type` | The topic, e.g. `orders.created`. Route on this |
| `timestamp` | When the event happened, ISO 8601 UTC with milliseconds. Stable across retries |
| `data` | The topic-specific payload. Most topics send the same object the REST API returns |
| `version` | Payload version, currently always `"v2"` |
| `seller_id` | The seller the event belongs to. It's in the signed body, so multi-seller apps can route on it |

Headers sent with every delivery:

| Header | Value |
|---|---|
| `webhook-id` | UUID, unique per event and reused on retries. **Dedupe on this** |
| `webhook-timestamp` | Unix seconds when this attempt was sent |
| `webhook-signature` | Space-separated `v1,<base64 HMAC-SHA256>` entries |
| `Content-Type` | `application/json` |

The body has no event `id`. Use the `webhook-id` header as your idempotency
key. There are no `X-Whatnot-*` headers.

## Shared Conventions

**Money** fields are objects with a decimal-string amount and an ISO 4217
currency:

```json
{ "amount": "49.77", "currency": "USD" }
```

Keep `amount` as a string or decimal type, never a float.

**Customer data** needs the **`read:customers`** scope. Without it these
fields are `null`:

| Topic | Fields |
|---|---|
| `orders.created`, `orders.updated` | `buyer` |
| `shipments.created` | `recipient`, `destination_address`, `documents` |
| `shipments.label_generated` | `documents` |

Destination addresses and shipping documents also need customer-address
access. Private apps have it; public apps get it once Whatnot approves them.
(The guide lists `destination_address` for `shipments.created`, though the
current Shipment schema in the topic reference doesn't include it. Treat it as
optional.)

**Sample values** below come from Whatnot's reference examples or are
illustrative. Don't rely on their ID formats.

## Topics and Payloads

Each topic needs a scope that both your app and the seller's installation
hold. Without it, that seller's events aren't delivered. Whatnot says new
topics and payload fields may be added over time.

### Orders (`read:orders`)

#### `orders.created` and `orders.updated`

`data` is an **Order**:

```json
{
  "id": "<order id>",
  "status": "pending_fulfillment",
  "show_id": "9b2f6c1e-4d3a-4f8b-a1c2-3d4e5f6a7b8c",
  "transaction_type": "auction",
  "buyer": { "id": "<user id>", "username": "<username>", "display_name": null },
  "amounts": {
    "subtotal": { "amount": "40.00", "currency": "USD" },
    "shipping": { "amount": "5.00", "currency": "USD" },
    "tax": { "amount": "4.77", "currency": "USD" },
    "applied_discount": null,
    "total": { "amount": "49.77", "currency": "USD" }
  },
  "created_at": "2026-10-20T16:05:00.000Z",
  "updated_at": "2026-10-20T16:05:00.000Z",
  "cancelled_at": null
}
```

- `status`: `pending`, `pending_fulfillment`, `completed`, `cancelled` or
  `failed`. Fulfil `pending_fulfillment` orders; `pending` ones aren't ready.
- `transaction_type`: `buy_it_now`, `auction`, `giveaway`, `other` or `null`.
- `show_id` is `null` for orders placed outside a show.
- `applied_discount` is `null` or `{ "type": "fixed_price", "amount": Money }`
  (there's also a percentage variant).
- `buyer` needs `read:customers`.
- Watch `cancelled_at` on `orders.updated`.

### Shows (`read:shows`)

#### `shows.created` and `shows.updated`

`data` is a **Show**: `id`, `title`, `description`, `status` (`scheduled`,
`live`, `stopped`, `ended`, `cancelled`), `visibility` (`public`, `private`),
`scheduled_start_at`, `ended_at`, `thumbnail`, `created_at`, `updated_at`.

- `shows.created` excludes rehearsals.
- `shows.updated` fires even when only `updated_at` changed.

#### `shows.started`, `shows.ended` and `shows.cancelled`

```json
{ "show_id": "9b2f6c1e-4d3a-4f8b-a1c2-3d4e5f6a7b8c" }
```

- `shows.started` also fires when a stopped show resumes.
- `shows.ended` includes Whatnot ending an abandoned show.

### Merchandising (`read:merchandising`)

#### `merchandising.products.added_to_show` and `merchandising.products.removed_from_show`

```json
{ "product_id": "<product id>", "show_id": "<show id>" }
```

`removed_from_show` also fires when the listing was deleted.

### Shipments (`read:shipments`)

#### `shipments.created`

`data` is a **Shipment**:

```json
{
  "id": "<shipment id>",
  "status": "label_generated",
  "fulfillment_method": "shipping",
  "recipient": { "id": "<user id>", "username": "<username>", "display_name": null },
  "weight": { "value": 8, "unit": "ounce" },
  "dimensions": { "length": 6, "width": 4, "height": 2, "unit": "inch" },
  "signature_required": false,
  "hazardous_material": "not_hazardous",
  "tracking": {
    "carrier": "usps",
    "service": "usps_ground_advantage",
    "tracking_code": "<tracking code>",
    "last_mile_tracking_code": null
  },
  "documents": { "label_url": "<url>", "bundled_url": "<url>", "commercial_invoice_url": null },
  "insurance": { "amount": { "amount": "50.00", "currency": "USD" }, "contents": "<description>" },
  "required_actions": [],
  "dropoff_due": null,
  "replacement_shipment_id": null,
  "created_at": "2026-10-20T16:10:00.000Z",
  "updated_at": "2026-10-20T16:10:00.000Z"
}
```

`recipient` and `documents` need `read:customers` (documents also need
customer-address access).

#### `shipments.label_generated`

```json
{
  "shipment_id": "<shipment id>",
  "reason": "generated",
  "tracking": { "carrier": "usps", "service": "usps_ground_advantage", "tracking_code": "<code>", "last_mile_tracking_code": null },
  "documents": { "label_url": "<url>", "bundled_url": "<url>", "commercial_invoice_url": null }
}
```

`reason` is `generated` (first label) or `regenerated` (replacement).
`documents` is `null` without `read:customers` and customer-address access.

#### `shipments.tracking_code_added`

```json
{ "shipment_id": "<shipment id>", "tracking": { "carrier": "usps", "service": null, "tracking_code": "<code>", "last_mile_tracking_code": null } }
```

#### `shipments.parcel_updated`

`shipment_id`, `weight`, `dimensions`, `hazardous_material`,
`signature_required` and `insurance`. Any of the objects can be `null`.

#### `shipments.items.added` and `shipments.items.removed`

```json
{ "shipment_id": "<shipment id>", "shipment_item_ids": ["<item id>", "<item id>"] }
```

`shipment_item_ids` lists **every** item on the shipment after the change,
including items that didn't change.

### Products (`read:inventory`)

#### `products.created` and `products.updated`

`data` is a **Product**: `id`, `title`, `description`, `external_id`, `url`,
`category` (`{ id, name }`), `attributes` (`[{ id, name, value }]`), `options`
(`[{ id, name, values }]`), `media` (`[{ id, url, alt }]`),
`dimension_profile`, `created_at`, `updated_at`.

`products.updated` doesn't say which fields changed. Diff against your copy.

#### `products.deleted`

```json
{ "id": "<product id>" }
```

## Delivery and Retries

- Deliveries are HTTPS `POST` requests with a JSON body.
- **Any 2xx** counts as delivered. Whatnot times out after **5 seconds**, so
  return 2xx immediately and process asynchronously.
- Anything else (non-2xx, timeout, connection failure) is retried with
  exponential backoff, **up to 11 attempts over roughly 2.5 days** (about 31 s,
  1 min, 4.5 min, 17.5 min, 53 min, 2.2 h, 4.7 h, 9.1 h, 16.4 h, 1.2 d), then
  marked permanently failed.
- Each retry keeps the same `webhook-id` and gets a fresh `webhook-timestamp`
  and signature.
- **At least once, not exactly once, and unordered.** `orders.updated` can
  arrive before `orders.created` for the same order. Reconcile on the
  payload's own `timestamp`/`updated_at` and state, never on arrival order.
- A persistently failing endpoint is rate-limited, emailed a warning and
  eventually unsubscribed. Re-subscribe from the developer dashboard.
- Respond 4xx to a delivery that fails verification.

## Handling Unknown Topics

Log and return a 2xx for a `type` you don't recognise. An error only triggers
retries for an event you'll never handle.
