# Ventrata Webhooks Overview

## What Are Ventrata Webhooks?

Ventrata is a ticketing platform for tours and attractions. Its OCTO API has a `octo/webhooks`
capability (add it to the `Octo-Capabilities` header) that lets you register outbound HTTP
webhooks for order, booking, availability and product updates. Requests are **not signed**. You
add a secret header in the webhook's `headers` map when you create it, and Ventrata sends that
header on every delivery so you can confirm the request is yours.

Delivery is always an HTTP `POST`. Whether failed deliveries are retried is set per webhook with
`retryOnError`.

## Common Event Types

| Event | Also written as | Triggered When | Common Use Cases |
|-------|-----------------|----------------|------------------|
| `order_update` | `order.updated` | An order changes | Sync orders to your system |
| `booking_update` | `booking.updated` | A booking changes | Update reservations, send confirmations |
| `availability_update` | `availability.updated` | Availability for a departure changes | Refresh inventory and calendars |
| `product_update` | `product.updated` | A product changes | Re-sync the product catalogue |

The capability page lists the `_update` names while its examples write `booking.updated`, so
accept both forms and dispatch on `event`. For `order_update`, `octo/cart` is always included
automatically.

## Event Payload Structure

The body is a JSON object `{event, webhook, ...}` plus the objects the event concerns:

| Field | Contents |
|-------|----------|
| `event` | The event, e.g. `booking.updated` |
| `webhook` | The webhook object you created (`id`, `event`, `url`, ...) |
| `supplier` | The supplier (`id`, `name`, `reference`, `website`); more fields if extra capabilities are active |
| `order` | Same shape as `GET /orders/:orderId` |
| `booking` | Same shape as `GET /bookings/:uuid` |
| `product` | Same shape as `GET /products/:productId` |
| `availability` | One item from `GET /availability` |
| `diff` | Array of `{op, path, was, value}` operations; emitted for `order_update`, `booking_update` and `product_update` |

Capability-specific fields (pricing, offers, extras, questions) appear as they do on the matching
API endpoints. When `octo/cardPayments` is active, detailed `cardPayment` payloads are not sent.

```json
{
  "event": "booking.updated",
  "webhook": { "id": "webhook_booking_update", "event": "booking.updated", "url": "https://example.com/webhooks/ventrata" },
  "supplier": { "id": "3d6f0a3a-59d4-4b16-a0c5-11d2d8a4e6b7", "name": "City Sightseeing Group" },
  "booking": { "uuid": "89fe0192-ddcd-430a-b285-e1396a4725d2", "status": "ON_HOLD" },
  "diff": [{ "op": "add", "path": "path-example", "was": "was-example", "value": "value-example" }]
}
```

## Full Event Reference

For the complete payload schemas, see [Ventrata's webhooks capability](https://docs.ventrata.com/capabilities/webhooks).
