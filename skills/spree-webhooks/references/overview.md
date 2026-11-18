# Spree Webhooks Overview

## What Are Spree Webhooks?

Spree Commerce (Spree 5/6, the open-source headless e-commerce platform) sends an HTTP `POST` to each of a store's webhook endpoints when events happen: orders, payments, fulfillments, catalog, customers, returns, marketplace sellers and more. Each store has its own endpoints, created in the admin or the Admin API, and each endpoint subscribes to events or patterns such as `order.*`.

Delivery: any non-2xx response, timeout or connection error counts as a failure. A failed delivery is sent again with growing waits, up to 5 attempts in total over about six minutes. 15 consecutive failures disable the endpoint, and any delivery can be re-sent by hand from the delivery log. A re-sent delivery keeps the same event `id`.

Spree 6.0 renamed some events (`order.completed` is now `order.placed`, `shipment.shipped` is now `fulfillment.fulfilled`, and `stock_item.*`, `wished_item.*` and `digital.*` became `stock_level.*`, `wishlist_item.*` and `digital_asset.*`). Until Spree 6.5 both names are sent, and the old-name delivery carries `metadata.deprecated_alias_of`, so skip it.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `order.placed` | A customer completed checkout | Send to fulfilment or CRM |
| `order.paid` | The order is fully paid | Release for fulfilment |
| `order.canceled` | The order was canceled | Cancel downstream work |
| `payment.completed` | A payment succeeded | Record the payment |
| `fulfillment.fulfilled` | One parcel went out | Notify the customer |
| `user.created` | A new customer registered | Sync to a CRM |
| `product.updated` | A product changed | Refresh a search index |
| `webhook.test` | `send_test` was called on the endpoint | Check reachability and verification |

Other events in Spree's list include `order.fulfilled`, `payment.refunded`, `product.created`, `product.out_of_stock`, `product.back_in_stock`, `return.received`, `refund.created`, `seller.approved` and `customer.anonymized`.

## Event Payload Structure

Spree's envelope example, with `data` elided as printed:

```text
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "order.placed",
  "created_at": "2025-01-15T10:30:00Z",
  "data": { ... },
  "metadata": {
    "spree_version": "6.0.0"
  }
}
```

| Field | Description |
|-------|-------------|
| `id` | Unique UUID for this event; the same on every attempt and re-send |
| `name` | Event name (dispatch on this) |
| `created_at` | ISO8601 time the event occurred |
| `data` | The serialized resource (V3 API format with prefixed IDs) |
| `metadata` | Spree version and facts about the event |

Request headers: `Content-Type: application/json`, `User-Agent: Spree-Webhooks/1.0`, `X-Spree-Webhook-Event`, `X-Spree-Webhook-Signature`, `X-Spree-Webhook-Timestamp`.

Payloads carry only what a customer could see; fetch back-office fields from the Admin API with the `id` in the payload.

## Full Event Reference

For the complete list of events and payload schemas, see [Spree's webhook documentation](https://spreecommerce.org/docs/developer/core-concepts/webhooks) and its [Webhook Events & Payloads](https://spreecommerce.org/docs/api-reference/webhooks-events) page.
