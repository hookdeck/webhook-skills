# Spree Webhooks Overview

## What Are Spree Webhooks?

Spree Commerce (Spree 5/6, the open-source headless e-commerce platform) sends an HTTP `POST` to each of a store's webhook endpoints when events happen: orders, payments, fulfillments, catalog, customers, returns, marketplace sellers and more. Each store has its own endpoints, created in the admin or the Admin API, and each endpoint subscribes to events or patterns such as `order.*`.

Delivery: any non-2xx response, timeout or connection error counts as a failure. A failed delivery is sent again with growing waits, up to 5 attempts in total over about six minutes. 15 consecutive failures disable the endpoint, and any delivery can be re-sent by hand from the delivery log. A re-sent delivery keeps the same event `id`.

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

```json
{
  "id": "evt_...",
  "name": "order.placed",
  "created_at": "2026-10-26T12:00:00Z",
  "data": { "id": "or_...", "display_total": "$99.99", "currency": "USD", "items": [], "fulfillments": [], "payments": [] },
  "metadata": { "spree_version": "6.0.0" }
}
```

| Field | Description |
|-------|-------------|
| `id` | Unique ID for this event; the same on a re-send |
| `name` | Event name (dispatch on this) |
| `created_at` | ISO8601 time the event occurred |
| `data` | The serialized resource (V3 API format with prefixed IDs) |
| `metadata` | Spree version and facts about the event |

Request headers: `Content-Type: application/json`, `User-Agent: Spree-Webhooks/1.0`, `X-Spree-Webhook-Event`, `X-Spree-Webhook-Signature`, `X-Spree-Webhook-Timestamp`.

Payloads carry only what a customer could see; fetch back-office fields from the Admin API with the `id` in the payload.

## Full Event Reference

For the complete list of events and payload schemas, see [Spree's webhook documentation](https://spreecommerce.org/docs/developer/core-concepts/webhooks) and its [Webhook Events & Payloads](https://spreecommerce.org/docs/api-reference/webhooks-events) page.
