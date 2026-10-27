# Katana Webhooks Overview

## What Are Katana Webhooks?

Katana MRP is a cloud manufacturing ERP. Katana sends an HTTP request to your URL when a record you subscribed
to changes (sales orders, purchase orders, manufacturing orders, inventory, products and more). You create
webhooks through the public API; each one has its own signing token and a list of `subscribed_events`.

Katana's docs don't name the HTTP method, so the examples accept GET, POST, PUT, PATCH and DELETE. Hookdeck's
Katana MRP source (type `KATANA`) pre-selects POST without managing the method, so allow any other method
Katana uses on the source.

## Common Event Types

The event name is the body's top-level `action` field. No header names the event.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `sales_order.created` | A sales order is created | Sync new orders to a CRM or WMS |
| `sales_order.delivered` | A sales order is delivered | Send shipping confirmation |
| `sales_order.invoiced` | A sales order is invoiced | Post to accounting |
| `purchase_order.received` | A purchase order is fully received | Update inbound stock |
| `purchase_order.partially_received` | Part of a purchase order is received | Track partial deliveries |
| `manufacturing_order.done` | A manufacturing order is completed | Update finished-goods inventory |
| `manufacturing_order.blocked` | A manufacturing order is blocked | Alert production |
| `inventory.product_out_of_stock` | A product runs out of stock | Trigger reorder |

### Documented event strings

- `sales_order.`: `created`, `updated`, `deleted`, `packed`, `delivered`, `invoiced`, `availability_updated`, `approved`
- `purchase_order.`: `created`, `updated`, `deleted`, `partially_received`, `received`, `approved`, `billed`
- `purchase_order_row.`: `created`, `updated`, `deleted`, `received`
- `outsourced_purchase_order.`: `created`, `updated`, `deleted`, `received`, `approved`, `billed`
- `outsourced_purchase_order_row.`: `created`, `updated`, `deleted`, `received`
- `outsourced_purchase_order_recipe_row.`: `created`, `updated`, `deleted`
- `manufacturing_order.`: `created`, `updated`, `deleted`, `blocked`, `in_progress`, `done`
- `manufacturing_order_operation_row.`: `created`, `updated`, `deleted`, `blocked`, `in_progress`, `paused`, `completed`
- `manufacturing_order_recipe_row.`: `created`, `updated`, `deleted`, `ingredients_in_stock`
- `product.`, `material.`, `variant.`: `created`, `updated`, `deleted`
- `product_recipe_row.`: `created`, `updated`, `deleted`
- `inventory.`: `product_updated`, `material_updated`, `product_out_of_stock`, `material_out_of_stock`

## Event Payload Structure

```json
{
  "resource_type": "sales_order",
  "action": "sales_order.created",
  "object": {
    "id": 12345,
    "status": "NOT_SHIPPED",
    "href": "https://api.katanamrp.com/v1/sales_orders/12345"
  }
}
```

`object` holds only `id`, `status` and `href`, so fetch the full record from `href` with your API key.
The payload above is illustrative: confirm field values against a real delivery.

## Delivery

Acknowledge with a 20X within 10 seconds. Otherwise Katana retries three more times (30 s, 2 min, 15 min, each
"or more"). Subscribing to both a status event and the matching update event can deliver two identical payloads.

## Full Event Reference

See [Create a webhook](https://developer.katanamrp.com/reference/createwebhook) for the complete list.
