# Creem Webhooks Overview

## What Are Creem Webhooks?

Creem uses webhooks to push real-time notifications about payments and subscriptions to an
HTTPS endpoint you register. You can use them to enable access after a successful payment,
remove access after a canceled subscription, or confirm that a payment arrived from the
customer who started it. Each delivery is a JSON `POST`.

## Common Event Types

Dispatch on the body's `eventType` field. Creem documents 17 events:

| `eventType` | Triggered When | Common Use |
|-------------|----------------|------------|
| `checkout.completed` | A checkout finishes (carries `license_keys` when the product issues them) | Fulfil the order |
| `subscription.active` | A new subscription is created and its payment collected | Synchronisation only; Creem advises `subscription.paid` for access |
| `subscription.paid` | A subscription payment succeeds | Grant or extend access |
| `subscription.canceled` | The merchant or customer canceled the subscription | Revoke access |
| `subscription.scheduled_cancel` | Cancellation is scheduled for the end of the billing period | Retention offer |
| `subscription.past_due` | A payment attempt failed; Creem retries it | Payment-recovery prompt |
| `subscription.unpaid` | The subscription moved to `unpaid` after failed collection | Suspend access per policy |
| `subscription.expired` | `current_end_period` was reached without a new payment | Revoke access (retries can still happen until `canceled`) |
| `subscription.update` | The subscription was changed | Sync |
| `subscription.trialing` | The subscription entered a trial | Sync |
| `subscription.paused` | The subscription was paused | Sync |
| `refund.created` | A refund is created | Bookkeeping |
| `dispute.created` | A dispute is opened | Alert your team |
| `credits.granted` | Credits were added to a customer's credit account | Balance sync |
| `credits.consumed` | Credits were debited from a customer's account | Low-balance warnings |
| `credits.auto_recharged` | An empty account was topped up automatically (also fires `credits.granted`) | Billing sync |
| `customer_credits.exhausted` | Credits ran out while settling a prepaid usage price | Upsell, throttling |

## Event Payload Structure

```json
{
  "id": "evt_5WHHcZPv7VS0YUsberIuOz",
  "eventType": "checkout.completed",
  "created_at": 1728734325927,
  "object": {
    "id": "ch_4l0N34kxo16AhRKUHFUuXr",
    "object": "checkout",
    "order": { "id": "ord_...", "status": "paid" },
    "customer": { "id": "cust_...", "email": "customer@emaildomain" },
    "subscription": { "id": "sub_...", "status": "active" }
  }
}
```

- `id` is the event id (`evt_...`); use it to deduplicate.
- `eventType` names the event; no header carries it.
- `created_at` is a Unix time in milliseconds.
- `object` is the resource; its own `object` key names the kind (`checkout`, `subscription`,
  `refund`, `dispute`, or a `customer_credits_*` kind for credit events).
- Credit amounts (`amount_minor_units`, `balance_after_minor_units`) are strings.

## Request Headers

| Header | Purpose |
|--------|---------|
| `creem-signature` | Hex HMAC-SHA256 of the raw body (see [verification.md](verification.md)) |

## Retries and Delivery

Reply with HTTP `200` to acknowledge. If delivery fails, Creem retries with progressive
backoff: 5 attempts in total (the initial delivery, then after 30 seconds, 5 minutes,
30 minutes and 6 hours). Events are not retried after 24 hours, even if attempts remain. The
same event can arrive more than once, so make the handler idempotent. You can also resend
events from the Developers section of the dashboard.

Creem has no static source IPs for webhooks, so don't rely on an IP allowlist; verify the
signature on every request. WAF or bot-protection products may challenge these automated
requests, so add a skip rule for the webhook route if deliveries are blocked.

## Full Event Reference

See Creem's [webhooks documentation](https://docs.creem.io/code/webhooks).
