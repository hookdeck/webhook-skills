# Square Webhooks Overview

## What Are Square Webhooks?

Square webhooks are HTTP POST notifications that Square sends to your
application when events happen in a Square account — a payment is taken, a
refund is issued, an invoice is paid, an order changes, and more. Events can
originate from the Square Dashboard, Square Point of Sale, or any third-party
application built on the Square APIs.

You create a **webhook subscription** in the Square Developer Console that
registers a **notification URL** (an HTTPS endpoint you control) and a set of
**event types**. When a subscribed event occurs, Square delivers a JSON
payload to your notification URL. In most cases notifications arrive in well
under 60 seconds of the associated event.

Your endpoint must respond with a `2xx` status code promptly to acknowledge
receipt. If it does not, Square retries delivery with exponential backoff for
up to 24 hours (starting at 1 minute and extending up to 8-hour intervals),
after which the notification is discarded. Retried requests include
`square-retry-number` and `square-retry-reason` headers.

## Common Event Types

The event type is delivered in the payload's top-level `type` field.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `payment.created` | A new payment is created | Record the sale, start fulfillment |
| `payment.updated` | A payment changes state (e.g. `COMPLETED`) | Confirm capture, reconcile ledgers |
| `refund.created` | A refund is initiated | Update order status, notify customer |
| `refund.updated` | A refund changes state | Reconcile refunds when completed |
| `invoice.payment_made` | A payment is made against an invoice | Mark invoice paid, trigger receipts |
| `order.created` | An order is created | Sync to inventory / OMS |
| `order.updated` | An order is updated | Update fulfillment, sync line items |
| `customer.created` | A new customer is created | CRM sync, welcome email |

## Event Payload Structure

All Square event notifications share the same top-level envelope:

```json
{
  "merchant_id": "6SSW7HV8K2ST5",
  "type": "payment.updated",
  "event_id": "6a8f5f28-54a1-4eb0-a98a-3111513fd4fc",
  "created_at": "2020-02-06T21:27:34.308Z",
  "data": {
    "type": "payment",
    "id": "KkAkhdMsgzn59SM8A89WgKwekxLZY",
    "object": {
      "payment": {
        "id": "KkAkhdMsgzn59SM8A89WgKwekxLZY",
        "status": "COMPLETED",
        "amount_money": { "amount": 100, "currency": "USD" }
      }
    }
  }
}
```

Key fields:

- **`type`** — the event type; dispatch your handler logic on this value.
- **`event_id`** — a unique ID for the event; use it for idempotency to skip
  duplicate deliveries (Square may deliver the same event more than once).
- **`merchant_id`** — the Square account (merchant) the event belongs to.
- **`created_at`** — ISO 8601 timestamp of when the event occurred.
- **`data.type`** — the affected object type (e.g. `payment`, `refund`, `order`).
- **`data.id`** — the ID of the affected object.
- **`data.object`** — the affected object's current state.

## Full Event Reference

For the complete list of event types and payloads, see
[Square's webhook documentation](https://developer.squareup.com/docs/webhooks/overview).
