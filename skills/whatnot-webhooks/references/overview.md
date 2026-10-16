# Whatnot Webhooks Overview

## What Are Whatnot Webhooks?

Whatnot sends webhooks from its **Seller API** so your app can react to
sales, listing changes, orders, livestreams and shipping labels without
polling the GraphQL API. Whatnot describes the API as being in **development
preview**, with "a growing set of event topics", so expect new topics to
appear.

Source: [Webhooks overview](https://developers.whatnot.com/docs/webhooks/overview)
and the per-topic pages linked from it.

## Envelope

```json
{
  "id": "<Event ID: UUID>",
  "timestamp": "<Event Timestamp: ISO 8601 UTC>",
  "topic": "<Event Topic>",
  "object": { "...": "<Object type specific to topic>" }
}
```

| Field | Meaning |
|---|---|
| `id` | Event ID (UUID). Use it as your idempotency key |
| `timestamp` | When the event happened, ISO 8601 UTC |
| `topic` | The topic string, e.g. `order/created`. Route on this |
| `object` | The topic-specific payload |

Headers sent with every delivery:

| Header | Value |
|---|---|
| `X-Whatnot-Seller-Id` | The seller the event is for |
| `X-Whatnot-Webhook-Signature` | Hex HMAC-SHA256 of the raw body (see [verification.md](verification.md)) |

## Shared Conventions

**IDs** are GraphQL Global IDs, which you can pass back to the Seller API's
`node` / `order` / `listing` queries. `external_id` and `variant_external_id`
are your own IDs, if you set them when creating the product.

**Money** fields are objects with a string amount and an ISO 4217 currency:

```json
{ "amount": "12.34", "currency": "USD" }
```

**Customer data**: `shipping_address`, `tracking_info` and `label_url` are
only populated for apps granted the **`read_customers`** scope. Without it the
fields are omitted or `null`.

**Placeholders**: Whatnot's docs show placeholder values (`"<Product Global
ID>"`), not real sample data. The payloads in this skill's tests are
illustrative, so don't rely on their ID formats.

## Topics and Payloads

The shapes below are the `object` field of the envelope.

### `product/sold`

Sent when a product is sold. Whatnot suggests using it to decrement your own
inventory.

```json
{
  "product_id": "<Product Global ID>",
  "listing_id": "<Listing Global ID>",
  "order_id": "<Order Global ID>",
  "external_id": "<Product External ID>",
  "variant_id": "<Variant Global ID, or null>",
  "variant_external_id": "<Variant External ID, or null>",
  "quantity": 1,
  "product_created_by_client_app_id": "<Client App ID that created the product, or null>"
}
```

### `bulk_operation/finished`

Sent when a bulk operation completes. `status` is a `BulkOperationStatus`
from the GraphQL schema. Use it to know when to fetch the result.

```json
{
  "id": "<Bulk Operation Global ID>",
  "status": "<The Completion status of the Bulk Operation>"
}
```

### `listing/created` and `listing/updated`

Same shape for both. Includes a subset of listing fields;
`transaction_type` tells you whether it's an auction.

```json
{
  "product_id": "<Product Global ID, or null>",
  "listing_id": "<Listing Global ID>",
  "external_id": "<Product External ID, or null>",
  "quantity": 1,
  "transaction_type": "<Either AUCTION or BUY_IT_NOW>",
  "listing_status": "<Listing status, or null>",
  "condition": "<Listing condition, or null>",
  "category_name": "<Category name, or null>",
  "category_id": "<Category Global ID, or null>"
}
```

### `order/created` and `order/updated`

Same shape for both.

```json
{
  "product_id": "<Product Global ID>",
  "listing_id": "<Listing Global ID>",
  "external_id": "<Product External ID, or null>",
  "order_id": "<Order Global ID>",
  "quantity": 1,
  "subtotal": { "amount": "10.00", "currency": "USD" },
  "shipping_price": { "amount": "5.00", "currency": "USD" },
  "taxation": { "amount": "1.00", "currency": "USD" },
  "customs": { "amount": "0.00", "currency": "USD" },
  "total": { "amount": "16.00", "currency": "USD" },
  "items": [
    {
      "product_id": "<Product Global ID>",
      "listing_id": "<Listing Global ID>",
      "price": { "amount": "10.00", "currency": "USD" },
      "quantity": 1,
      "subtotal": { "amount": "10.00", "currency": "USD" },
      "variant_id": "<Variant Global ID, or null>",
      "variant_external_id": "<Variant External ID, or null>"
    }
  ],
  "product_created_by_client_app_id": "<Client App ID that created the product, or null>",
  "shipping_address": {
    "address_line1": "<Address line 1>",
    "address_line2": "<Address line 2>",
    "city": "<City>",
    "state": "<State>",
    "postal_code": "<Postal code>",
    "country": "<Country code>"
  },
  "tracking_info": {
    "tracking_code": "<Tracking code>",
    "courier": "<Courier>",
    "label_url": "<Shipping label URL>"
  },
  "cancelled_at": null
}
```

- `customs` may be `null`.
- `shipping_address` and `tracking_info` are `null` without `read_customers`.
- `cancelled_at` is set when the order is cancelled. Watch for it on
  `order/updated`.

### `livestream/created`

Sent when a seller creates a livestream.

```json
{
  "livestream_id": "<Livestream Global ID>",
  "title": "<Livestream title>",
  "starts_at": "<ISO 8601 UTC scheduled start, or null>"
}
```

### `livestream/stopped`

Sent when a livestream **ends or is cancelled**. The payload doesn't say
which.

```json
{ "livestream_id": "<Livestream Global ID>" }
```

### `livestream/product_added` and `livestream/product_removed`

Same shape for both. Sent when a listing is added to or removed from a
livestream.

```json
{
  "product_id": "<Product Global ID>",
  "livestream_id": "<Livestream Global ID>",
  "listing_id": "<Listing Global ID>",
  "product_external_id": "<Product External ID, or null>"
}
```

### `shipment/label_created` (Beta)

Whatnot marks this topic **Beta**: its types, behavior and existence may
change without notice, and it's not recommended for production use. Sent when
a shipping label is generated or regenerated.

```json
{
  "shipment_id": "<Shipment ID>",
  "reason": "<label_generated or label_regenerated>",
  "tracking_code": "<Tracking code, or null>",
  "courier": "<Courier, or null>",
  "label_url": "<Shipping label URL, or null>",
  "label_generated_at": "<ISO 8601 UTC>"
}
```

`label_url` requires `read_customers`.

## Delivery and Retries

- Deliveries are HTTP `POST` requests.
- Respond with **HTTP 200 OK**. Whatnot's docs ask for 200 specifically.
- Any other response is retried **up to 5 times over about 10 minutes**.
  After that the event is not redelivered, so reconcile through the Seller
  API if your endpoint was down for longer.
- Because of retries, the same `id` can arrive more than once. Dedupe on it.

## Handling Unknown Topics

During the preview Whatnot may add topics. Log and return `200` for a topic
you don't recognise. Returning an error only triggers 5 pointless retries.
