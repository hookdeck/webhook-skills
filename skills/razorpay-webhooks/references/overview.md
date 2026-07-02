# Razorpay Webhooks Overview

## What Are Razorpay Webhooks?

Razorpay is an India-focused payments platform. Webhooks let Razorpay notify
your application when events happen in the payment flow — orders, payments,
refunds, subscriptions, settlements, disputes, payouts, and more — instead of
your app having to poll the API.

When a subscribed event occurs, Razorpay sends an **HTTP POST** request with a
JSON payload to the endpoint URL you configure in the dashboard. Every request
carries an `X-Razorpay-Signature` header so you can verify it genuinely came
from Razorpay (see [verification.md](verification.md)).

A single endpoint receives **all** subscribed events. You determine which event
occurred by reading the top-level `event` field in the JSON body — not a header.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `payment.authorized` | Payment is authorized but not yet captured | Manual capture flows, fraud review |
| `payment.captured` | Payment is successfully captured | Fulfil order, grant access, send receipt |
| `payment.failed` | A payment attempt fails | Notify customer, retry, analytics |
| `order.paid` | An order is fully paid | Mark order complete, start fulfilment |
| `refund.created` | A refund is initiated | Track refund lifecycle |
| `refund.processed` | A refund has been processed | Update ledger, notify customer |
| `refund.failed` | A refund attempt fails | Alert ops, retry refund |
| `subscription.charged` | A subscription charge succeeds | Extend access, issue invoice |
| `subscription.activated` | A subscription becomes active | Provision the plan |
| `subscription.cancelled` | A subscription is cancelled | Revoke access, offboard |

Additional event families include `payment_link.*`, `payout.*` (RazorpayX),
`settlement.*`, `invoice.*`, `virtual_account.*`, and disputes
(`payment.dispute.*`).

## Event Payload Structure

All events share the same envelope:

```json
{
  "entity": "event",
  "account_id": "acc_XXXXXXXXXXXX",
  "event": "payment.captured",
  "contains": ["payment"],
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_XXXXXXXXXXXX",
        "amount": 5000,
        "currency": "INR",
        "status": "captured",
        "order_id": "order_XXXXXXXXXXXX"
      }
    }
  },
  "created_at": 1590597321
}
```

| Field | Description |
|-------|-------------|
| `entity` | Always `"event"` |
| `account_id` | Your Razorpay account identifier (`acc_…`) |
| `event` | The event type string, e.g. `payment.captured` |
| `contains` | Array of the entity keys present in `payload` (e.g. `["payment"]`, `["refund", "payment"]`) |
| `payload` | Wrapper object; each key in `contains` maps to `{ "entity": { … } }` |
| `created_at` | Unix timestamp (seconds) of when the event was created |

The `payload` for a webhook is a **snapshot** of the entity at the moment the
event occurred, so amounts and statuses reflect that point in time.

Amounts are in the **smallest currency unit** (e.g. paise for INR — `5000`
means ₹50.00).

## Full Event Reference

For the complete list of events and per-event payloads, see
[Razorpay's webhook documentation](https://razorpay.com/docs/webhooks/).
