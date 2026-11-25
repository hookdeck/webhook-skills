# Trackstar Webhooks Overview

## What Are Trackstar Webhooks?

[Trackstar](https://trackstarhq.com) is a unified API for warehouse management (WMS), shopping
cart, carrier, freight and ERP systems. It sends an HTTPS `POST` to an endpoint you register when a
resource changes in a customer's connected system (orders, inventory, shipments, products, ...)
and when something happens to a connection itself (created, deleted, sync stuck, error).
Trackstar uses [Svix](https://www.svix.com/) as its webhook provider, so every delivery is signed
with the Standard Webhooks scheme.

| Aspect | Value |
|--------|-------|
| Method | `POST`, `Content-Type: application/json` |
| Signature headers | `svix-id`, `svix-timestamp`, `svix-signature` (Standard Webhooks; `webhook-*` carry the same values) |
| Event name | Top-level `event_type` |
| Timing | Resource events fire at the resource's sync frequency; none are sent during a connection's initial sync |

Trackstar's docs don't state a retry schedule, response timeout or ordering guarantee. Treat
delivery as at-least-once: acknowledge fast with a `2xx`, deduplicate on `svix-id`, and make
effects idempotent.

## Event Payload Structure

Every payload has the same envelope:

| Field | Description |
|-------|-------------|
| `event_type` | The event name, e.g. `order.updated` |
| `connection_id` | The connection the event came from |
| `integration_name` | The integration (e.g. a WMS) the event came from |
| `integration_type` | `wms`, `cart`, `carrier` or `erp` (in Trackstar's OpenAPI spec, not its webhooks table) |
| `data` | The created or updated object |
| `previous_attributes` | Only on updated events: the previous values of the changed fields |
| `data_truncated`, `data_url` | Only when the event was too large to send: `data` holds just the `id`; call `data_url` with your API key for a download link to the full event |

Changes inside nested fields use a `.`-joined path where integers are array indexes and strings
are object keys: `"line_items.1.received_quantity": 1` refers to `data.line_items[1].received_quantity`.

```json
{
  "connection_id": "connection_id",
  "data": {
    "id": "id",
    "status": "received",
    "purchase_order_number": "PO#",
    "line_items": [
      { "sku": "sku1", "expected_quantity": 1, "received_quantity": 1 },
      { "sku": "sku2", "expected_quantity": 2, "received_quantity": 2 }
    ]
  },
  "event_type": "inbound-shipment.updated",
  "integration_name": "integration_name",
  "previous_attributes": { "status": "open", "line_items.1.received_quantity": 1 }
}
```

Event names are not fully consistent. Most multi-word resources use a hyphen
(`inbound-shipment.updated`, `connection-error.created`), but `inventory_ledger.created` uses an
underscore, and Trackstar's own sample body writes `inbound_shipment.updated`. Match on the names
in the list below, and let unknown names fall through to a `200`.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `connection.created` | A customer connects an integration | Start tracking the connection |
| `connection.deleted` | A connection is deleted | Clean up stored credentials and data |
| `connection.historical-sync-completed` | The initial sync finishes for a resource type | Start reading data (it is now queryable) |
| `connection.sync-job-stuck` | Trackstar decides a sync job won't progress | Alert support |
| `connection-error.created` | A connection error is raised | Prompt the customer to reconnect |
| `install.failed` | An attempt to connect an integration fails before a connection exists | Show an install error |
| `order.created` | An order is created in the WMS | Ingest the order |
| `order.updated` | An order changes (`previous_attributes` has the old values) | Update status |
| `order.shipment.created` | A shipment is created for an order | Send tracking |
| `inventory.updated` | An inventory item changes | Sync stock levels |
| `inbound-shipment.updated` | An inbound shipment changes | Track receiving |

The examples handle exactly these events and acknowledge anything else with `200`.

## Full Event List (68: 47 with event pages, 21 spec-only)

- **Admin:** `install.failed`, `connection.created`, `connection.deleted`,
  `connection.historical-sync-completed`, `connection.force-sync-completed`,
  `connection.sync-job-completed`, `connection.sync-job-stuck`, `connection.schedule-stuck`,
  `connection-error.created`, `connection-error.updated`, `connection-error.deleted`
- **WMS:** `bill.created`, `bill.updated`, `inbound-shipment.created`,
  `inbound-shipment.receipt.created`, `inbound-shipment.updated`, `inventory.created`,
  `inventory.updated`, `inventory_ledger.created`, `inventory_ledger.updated`, `order.created`,
  `order.shipment.created`, `order.updated`, `product.created`, `product.updated`,
  `return.created`, `return.updated`, `shipping-method.created`, `shipping-method.updated`,
  `warehouse-customer.created`, `warehouse-customer.updated`, `warehouse-location.created`,
  `warehouse-location.updated`, `warehouse.created`, `warehouse.updated`
- **Cart:** `cart-order.created`, `cart-order.cart-shipment.created`, `cart-order.updated`,
  `cart-product.created`, `cart-product.updated`, `cart-warehouse.created`, `cart-warehouse.updated`
- **Freight:** `freight-shipment.created`, `freight-shipment.updated`
- **Carrier:** `carrier-file.created`, `carrier-invoice-line-item.created`,
  `carrier-invoice-line-item.updated`
- **Spec-only** (in Trackstar's [OpenAPI spec](https://production.trackstarhq.com/openapi.json)
  `webhooks` block, with no event page): `connection.sync-job-cancelled`, and for ERP
  connections `erp-customer`, `erp-employee`, `erp-inventory`, `erp-item`, `erp-location`,
  `erp-purchase-order`, `erp-purchase-order-receipt`, `erp-sales-order`,
  `erp-sales-order-shipment` and `erp-vendor`, each with `.created` and `.updated`

The list is taken from the webhook pages in Trackstar's docs and its OpenAPI spec, and may not be
exhaustive.

## Full Event Reference

Each event's payload schema is in the `webhooks` block of Trackstar's
[OpenAPI spec](https://production.trackstarhq.com/openapi.json), with a full and a truncated shape
per event. The [webhook documentation](https://docs.trackstarhq.com/how-to-guides/webhooks/webhooks)
covers the envelope.
