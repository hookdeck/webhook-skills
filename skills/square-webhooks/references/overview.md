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

- **`type`** — the event type; dispatch your handler logic on this value. Uses
  **dot** notation (e.g. `order.updated`, `payment.updated`).
- **`event_id`** — a unique ID for the event; use it for idempotency to skip
  duplicate deliveries (Square may deliver the same event more than once).
- **`merchant_id`** — the Square account (merchant) the event belongs to.
- **`created_at`** — ISO 8601 timestamp of when the event occurred.
- **`data.type`** — the affected object type. **Do not conflate this with the
  top-level `type`.** The nested `data.type` uses **underscore** form and does
  not always match the dotted event type — e.g. a live `order.updated` event
  (top-level, dotted) carries `data.type: "order_updated"` (nested,
  underscored). Dispatch on the top-level `type`, not `data.type`.
- **`data.id`** — the ID of the affected object.
- **`data.object`** — the affected object's current state.

> **Confirmed live (2026-08).** An `order.updated` sandbox delivery carried the
> envelope above with `merchant_id`, top-level `type: "order.updated"`,
> `event_id`, `created_at`, and `data { type: "order_updated", id, object }`.

## Request Headers

A Square webhook delivery carries these headers (observed live, 2026-08):

| Header | Purpose |
|--------|---------|
| `x-square-hmacsha256-signature` | HMAC-SHA256 (base64) signature — **verify this one** |
| `x-square-signature` | HMAC-SHA1 (base64) signature seen on a live delivery; **not in Square's docs**, so don't rely on it |
| `square-environment` | `Sandbox` or `Production` |
| `square-subscription-id` | The webhook subscription that produced the delivery |
| `square-version` | The API version pinned on the subscription (e.g. `2026-07-15`) |
| `user-agent` | `Square Connect v2` |

Retried deliveries additionally include `square-retry-number` and
`square-retry-reason` (see below).

## Full Event Reference

For the complete list of event types and payloads, see
[Square's webhook documentation](https://developer.squareup.com/docs/webhooks/overview).
