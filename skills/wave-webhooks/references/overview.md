# Wave Webhooks Overview

## What Are Wave Webhooks?

Wave (waveapps.com) is accounting and invoicing software. Its webhooks send an HTTP POST with a JSON body to your HTTPS endpoint when invoices, estimates, or Wave Checkout payments change. They are configured per Wave app (not per business) and delivered for each business whose owner authorized your app through OAuth. Webhook delivery requires the connected business to be on a Wave **Pro** plan.

## Common Event Types

The event name is `event_type` in the JSON body. There is no event header.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `invoice.sent` | An invoice is sent to a customer | Sync to a CRM, start a follow-up timer |
| `invoice.viewed` | A customer views an invoice | Sales alerts |
| `invoice.paid` | An invoice is paid in full | Reconcile payments, release goods |
| `invoice.partially_paid` | A partial payment is recorded | Track balances |
| `invoice.overdue` | An invoice passes its due date unpaid | Dunning, reminders |
| `invoice.approved` | An invoice is approved | Approval workflows |
| `estimate.sent` | An estimate is sent | Pipeline tracking |
| `estimate.accepted` | A customer accepts an estimate | Convert to a project or invoice |
| `checkout.paid` | A Wave Checkout payment completes | Fulfil orders |

Other documented events: `invoice.overpaid`, `estimate.approved`, `estimate.viewed`, `estimate.reset`, `estimate.expired`, `estimate.paid`, `estimate.partially_paid`, `estimate.overpaid`. The examples handle the nine above and log the rest as unhandled; subscribe only to what you need.

## Event Payload Structure

```json
{
  "event_id": "2f210c44-f1ab-551e-89fa-333fb8d2a5fe",
  "event_type": "invoice.paid",
  "business_id": "63c77f29-875c-4cdc-947d-07430f628043",
  "data": {
    "invoice_id": "2496756670638588934",
    "customer_id": "21840161",
    "currency_code": "USD",
    "amount_paid": "8.98",
    "paid_date": "2026-04-29",
    "remaining_balance": "0.00"
  }
}
```

- `event_id` is stable per event, so use it for idempotency.
- Amounts are strings. `data` keys vary by event (for example `invoice_balance` on `invoice.overdue`, `checkout_id` and `email` on `checkout.paid`), so read them defensively.
- IDs in payloads are raw UUIDs. To use them in Wave's API they must be formatted as `Business:{business_id};Invoice:{invoice_id}` and Base64 encoded.

## Delivery and Retries

- Wave retries 5xx responses, timeouts, and connection errors up to 6 times over about 14 hours (roughly 1 min, 5 min, 30 min, 2 h, 12 h between attempts), then moves the delivery to a dead letter queue.
- 4xx responses are **not** retried and mark the delivery as failed.
- After 10 consecutive failures the subscription is suspended until you reactivate it under Tools > Webhooks.
- `invoice.viewed` and `estimate.viewed` don't fire when you view the document while logged into the business that created it.

## Full Event Reference

See [Wave Webhooks](https://developer.waveapps.com/hc/en-us/articles/51070353613716-Webhooks) and the [Webhooks Setup Guide](https://developer.waveapps.com/hc/en-us/articles/51070420388628-Webhooks-Setup-Guide).
