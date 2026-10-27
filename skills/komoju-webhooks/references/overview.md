# KOMOJU Webhooks Overview

## What Are KOMOJU Webhooks?

KOMOJU (komoju.com, by Degica) is a Japanese payment gateway. Webhooks let you subscribe to events in
KOMOJU, for example when a payment is captured or refunded. Each delivery is an HTTPS `POST` with a
JSON body. Webhooks are created in the dashboard (Manage > Webhooks); callers of the Payments API can
also attach a per-payment webhook, which is sent in addition to the dashboard ones.

## Common Event Types

The event name is the body's `type` field; the same value is sent in the `X-Komoju-Event` header.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `ping` | A test ping is sent (`data` is the webhook) | Check connectivity and signature setup |
| `payment.authorized` | A payment was authorized | Show konbini/bank-transfer instructions, hold stock |
| `payment.captured` | A payment was captured | Fulfil the order |
| `payment.updated` | A payment was changed | Sync status |
| `payment.expired` | A payment was expired | Release stock |
| `payment.cancelled` | A payment was cancelled | Cancel the order |
| `payment.refund.created` | A refund was created (may be partial) | Record a partial refund |
| `payment.refunded` | A payment was fully refunded | Mark the order refunded |
| `payment.failed` | A payment attempt failed (it may be re-attempted) | Prompt the customer to retry |
| `customer.created` | A customer was created | Sync customer records |
| `customer.updated` | A customer was updated | Sync customer records |
| `customer.deleted` | A customer was deleted | Remove customer records |
| `subscription.created` | A subscription was created | Start the subscription |
| `subscription.captured` | A subscription was captured | Extend access |
| `subscription.failed` | A subscription failed | Dunning |
| `subscription.suspended` | A subscription was suspended | Pause access |
| `subscription.deleted` | A subscription was deleted | End access |
| `settlement.created` | A settlement was created | Reconcile payouts |

The per-payment webhook list also names `payment.marked.as.fraud`, which is missing from the Events
table in the docs; handle unknown types by logging them.

## Event Payload Structure

```json
{
  "id": "dv7ywuavew3n2meqsllj5bbob",
  "type": "payment.authorized",
  "resource": "event",
  "data": {
    "id": "8xz5cn01gkt37cz0myd98k2f1",
    "resource": "payment",
    "status": "authorized",
    "amount": 1000,
    "total": 1080,
    "currency": "JPY",
    "payment_details": { "type": "bank_transfer", "email": "test@example.com", "order_id": "Y5236584956" },
    "external_order_num": "123",
    "created_at": "2018-11-13T06:19:49Z"
  },
  "created_at": "2018-11-13T06:19:49Z"
}
```

- `id` identifies the event: use it to deduplicate retries.
- `data` is the resource named by `data.resource` (`payment`, `webhook`, ...). The `ping` event's
  `data` is the webhook itself.

## Delivery

- A non-success status or a connection failure is retried 25 times with growing intervals (the last
  100 hours), the final attempt about 25 days later.
- Deliveries can be resent from the dashboard (from a payment's page).

## Full Event Reference

See [KOMOJU's webhook documentation](https://docs.komoju.com/en/docs/introduction/webhooks).
