# Redo Webhooks Overview

## What Are Redo Webhooks?

Redo (e-commerce returns and exchanges) pushes return events to your endpoint so you don't
have to poll the API. When a subscribed event occurs, Redo sends an HTTP `POST` with a JSON body
and expects a 2xx back within 5 seconds. If the endpoint doesn't return a 2xx, Redo retries
several times before discarding the event.

Webhooks carry no signature. Authentication is the `Authorization: Bearer <secret>` header,
where the secret is the one you set when creating the subscription (see
[verification.md](verification.md)). Events are delivered in order per subject (per return),
not across returns.

## What Events Does Redo Send?

You subscribe by **topic**; the payload's `type` field holds the short form.

| Topic | Payload `type` | Triggered when | Common use cases |
|-------|----------------|----------------|------------------|
| `return.created` | `created` | A new return is created by a customer or team member | Open a ticket, notify the warehouse |
| `return.updated` | `updated` | A return changes (status, items, ...) | Sync status, trigger refunds |
| (none) | `backfill` | A historical event sent during webhook setup or replay | Load history; handle without side effects |

`backfill` is not a topic you subscribe to: it arrives at setup or when you call the replay
endpoint (`POST /v2.2/webhooks/{webhookId}/replay` with `startTime` and `endTime`).

## Event Payload Structure

```json
{
  "type": "created",
  "at": "2023-08-18T12:00:00Z",
  "merchantName": "Example Merchant",
  "return": {
    "id": "64df65d4c5a4ca3eff4b4e43",
    "status": "pending",
    "order": { "id": "shopify-order-123" },
    "items": [{ "id": "item-1", "quantity": 1, "reason": "Too big" }],
    "totals": { "refund": { "amount": { "amount": "50.00", "currency": "USD" } } }
  },
  "order": { "id": "shopify-order-123", "items": [] }
}
```

- `type`: `created`, `updated` or `backfill`
- `at`: ISO 8601 time of the event
- `merchantName`: the merchant team that owns the return (useful for 3PLs handling many merchants)
- `return`: the complete return object (see Redo's Returns API reference). Items may include
  `upc`, `processingImages` and `customerImages`
- `order`: the original order data

## Idempotency

Redo's docs suggest `return.id` plus `at` as the unique key, and say duplicates can happen.
Process by `at`, because ordering across different returns isn't guaranteed.

## Full Event Reference

See Redo's webhook documentation: https://developers.redo.com/docs/guides/integrations/webhooks
