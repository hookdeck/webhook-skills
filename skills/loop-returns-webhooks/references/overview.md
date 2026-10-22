# Loop Returns Webhooks Overview

## What Are Loop Returns Webhooks?

Loop Returns sends an HTTP `POST` to a URL you choose whenever a subscribed event happens in Loop. Each subscription has a **topic**, which decides the payload shape, and a **trigger**, the Loop event that fires it. Every request carries an `X-Loop-Signature` header; see [verification.md](verification.md).

Payloads are JSON and always include `topic` and `trigger`. If you subscribe one URL to several triggers, dispatch on `trigger`.

## Topics

| Topic | Payload |
|-------|---------|
| Return | The return: `id`, `state`, `created_at`, `edited_at`, `total`, `customer`, line items, and more |
| Return processing | Details of queued return processing (see the docs for the schema) |
| Label | `id` (Loop return ID), `order_id`, `provider_order_id`, `carrier`, `tracking_number`, `label_status`, `label_updated_at`, `shipment_id` |
| Restock | The restocked item (see the docs for the schema) |
| Gift card | The requested gift card (see the docs for the schema) |
| Happy Returns shipment | The processed shipment (see the docs for the schema) |

Not every topic yields data for every trigger. A `label` topic with a `return.created` trigger can be empty because the label doesn't exist yet. Pair topics with matching triggers.

## Common Event Types

| Trigger (`trigger` property) | Triggered When | Common Use Cases |
|------------------------------|----------------|------------------|
| `return.created` | A return is submitted in the customer returns portal | Notify support, create a record in your OMS or WMS |
| `return.updated` | A return changes, including open to closed, cancelled or expired | Keep external state in sync |
| `return.closed` | A return's state becomes closed | Finalize accounting, close tickets |
| `return.processing.failed` | Queued return processing failed to complete | Alert the team, retry manually |
| `label.created` | A shipping label is created | Store tracking numbers, email the customer |
| `label.updated` | A label's shipment status changes | Track in-transit and delivered |
| `restock.requested` | An item in a return is restocked in Shopify | Update inventory |
| `giftcard.requested` | A gift card is requested as part of an exchange | Issue the gift card |
| `shipment.processed` | A Happy Returns shipment is processed | Update fulfillment records |

`return.updated` also fires when a return expires (`state: expired`). Possible `state` values are `open`, `cancelled`, `closed`, `review` and `expired`.

## Event Payload Structure

Return topic (abridged):

```json
{
  "topic": "return",
  "trigger": "return.created",
  "shop_id": 12345,
  "id": "1673",
  "state": "open",
  "created_at": "2019-04-01T12:00:00+00:00",
  "edited_at": null,
  "total": "48.81"
}
```

Label topic (abridged):

```json
{
  "topic": "label",
  "trigger": "label.updated",
  "shop_id": 9876,
  "id": 12345,
  "carrier": "USPS",
  "tracking_number": "28735625627856237856287",
  "label_status": "in_transit",
  "label_updated_at": "2019-04-01T12:00:00+00:00"
}
```

Note that `id` is a string in the return topic and an integer in the label topic, and label fields emit the literal string `"N/A"` when unset. Loop may add fields at any time; ignore ones you don't know.

## Full Event Reference

For the complete list of topics, triggers and payload schemas, see [Loop's webhook documentation](https://docs.loopreturns.com/webhook-reference/getting-started).
