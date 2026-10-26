# Mews POS Webhooks Overview

## What Are Mews POS Webhooks?

Mews (mews.com) is a hospitality cloud. Its **POS API** serves restaurant and bar point-of-sale integrations, and sends HTTP `POST` webhooks to your endpoint when bookings, orders or products change. Each request carries an `X-Signature` header so you can confirm it came from Mews. Only the POS API signs webhooks; the Mews Connector (PMS) API is separate.

Retries, timeout and success codes are not documented, so acknowledge quickly with a `2xx` and process work asynchronously.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `booking.status.updated` | A booking's status changes (for example `seated`) | Update table or guest state |
| `order.state.updated` | An order's state changes | Sync order lifecycle |
| `order.status.updated` | An order's status changes | Kitchen and front-of-house displays |
| `order.total.updated` | An order's total changes | Reconcile totals |
| `order.payments.added` | A payment is added to an order | Accounting and receipts |
| `product.availability.updated` | A product's availability changes | Menu and stock sync |

## Event Payload Structure

The documented body is a single JSON object with `data` and `meta`:

```json
{
  "data": {
    "id": "98656c4a-950d-4b19-b7ef-ad1744e92b53",
    "type": "bookings",
    "attributes": { "status": "seated", "updatedAt": "2025-02-06T09:41:30.465Z" }
  },
  "meta": { "eventType": "booking.status.updated" }
}
```

- `meta.eventType` names the event. Dispatch on this.
- `data.type` is the **entity** (`bookings`, `orders`, `products`). Several events share it, so keying on it merges different events.
- The docs say each message "encapsulates all simultaneous events" but show only a single `{data, meta}` object; how a multi-event message is shaped is not documented.

Treat every field as untrusted after verification and check types before reading nested values.

## Full Event Reference

See [Mews POS webhooks](https://docs.mews.com/pos-api/events/webhooks) and [Webhook security](https://docs.mews.com/pos-api/events/wh-security).
