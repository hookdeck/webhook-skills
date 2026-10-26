# Holded Webhooks Overview

## What Are Holded Webhooks?

Holded (business management and invoicing) sends an HTTP POST to your HTTPS endpoint when events occur in your account, such as an invoice being created or a payment being received. Deliveries are signed, retried and can be filtered by event.

Source: [Holded webhooks](https://www.holded.com/en-us/developers/webhooks)

## Common Headers

| Header | Description |
|--------|-------------|
| `x-holded-webhook-event` | Event name, e.g. `invoice.create` |
| `x-holded-webhook-date` | ISO 8601 send time, e.g. `2026-06-18T11:10:35Z` (not signed) |
| `x-holded-webhook-signature` | `sha256=` + HMAC-SHA256 hex of the raw body |
| `x-holded-webhook-id` | Unique event identifier, use it as an idempotency key |
| `x-holded-webhook-account-id` | Holded account that triggered the event |
| `x-holded-webhook-version` | Webhook system version, e.g. `v1` |

The event name is in the header, so read `x-holded-webhook-event` to route. The docs page doesn't show a payload schema; per-event payloads are described in Holded's API reference.

## Event Types

| Group | Events |
|-------|--------|
| Invoices | `invoice.create`, `invoice.update`, `invoice.delete`, `invoice.approve` |
| Credit Notes | `creditnote.create`, `creditnote.update`, `creditnote.delete`, `creditnote.approve` |
| Proforma Invoices | `proform.create`, `proform.update`, `proform.delete` |
| Sales Receipts | `salesreceipt.create`, `salesreceipt.update`, `salesreceipt.delete`, `salesreceipt.approve` |
| Estimates | `estimate.create`, `estimate.update`, `estimate.delete` |
| Sales Orders | `salesorder.create`, `salesorder.update`, `salesorder.delete` |
| Waybills | `waybill.create`, `waybill.update`, `waybill.delete` |
| Services | `service.create`, `service.update`, `service.delete` |
| Purchases | `purchase.create`, `purchase.update`, `purchase.delete`, `purchase.approve` |
| Purchase Refunds | `purchaserefund.create`, `purchaserefund.update`, `purchaserefund.delete`, `purchaserefund.approve` |
| Receipts | `receipt.create`, `receipt.update`, `receipt.delete` |
| Purchase Orders | `purchaseorder.create`, `purchaseorder.update`, `purchaseorder.delete` |
| Receipt Notes | `receiptnote.create`, `receiptnote.update`, `receiptnote.delete`, `receiptnote.approve` |
| Payments | `payment.create`, `payment.update`, `payment.delete` |
| Contacts | `contact.create`, `contact.update`, `contact.delete` |
| Products | `product.create`, `product.update`, `product.delete` |
| Stock | `stock.update` |
| Warehouses | `warehouse.create`, `warehouse.update`, `warehouse.delete` |

Holded also exposes a "List supported webhook event types" API endpoint, which is the live source if this list changes.

## Delivery Behaviour

- Respond with any `2xx` to acknowledge.
- On a non-2xx response Holded retries with exponential backoff (the docs don't give the schedule).
- Deduplicate on `x-holded-webhook-id`.
- Answer `2xx` for events you don't handle.

## Full Event Reference

See [Holded's webhook documentation](https://www.holded.com/en-us/developers/webhooks).
