# Mollie Webhooks Overview

## What Are Mollie Webhooks?

Mollie is a European payments platform. When the status of a resource you created
(most commonly a **payment**) changes, Mollie notifies your server by calling the
`webhookUrl` you set when creating that resource.

Unlike most providers, a Mollie webhook is intentionally minimal and **carries no
status and no signature**. It is an HTTP **POST** with `Content-Type:
application/x-www-form-urlencoded` and a **single** body parameter:

```
id=tr_5B8cwPMGnU6qLbRvo7qEZo
```

You are expected to take that `id` and **fetch the resource from the Mollie API**
to read its authoritative status. See [verification.md](verification.md) for the
fetch-to-confirm pattern and why it replaces signature verification.

## Why No Signature?

Because the webhook never transmits the status, a forged webhook is harmless: the
worst an attacker can do is make you re-fetch a real payment that you own. As
Mollie puts it, "fake calls to your webhook will never result in orders being
processed without being actually paid." Do **not** rely on IP allowlists either —
Mollie's webhook source IPs change over time.

## Common Payment Statuses

The webhook fires on each status change. After fetching the payment, act on
`payment.status`:

| Status | Triggered When | Common Use Cases |
|--------|----------------|------------------|
| `open` | Payment created, customer not yet paid | Wait; no action |
| `pending` | Payment started, awaiting completion | Show "processing" state |
| `authorized` | Funds reserved (pay-later / two-step methods) | Capture to collect funds |
| `paid` | Payment succeeded | Fulfill the order, send receipt |
| `canceled` | Canceled before completion | Release held stock |
| `expired` | Not completed in time | Release held stock, prompt retry |
| `failed` | Payment attempt failed | Notify customer, offer retry |

Refunds and chargebacks do **not** get their own webhook payload — they reuse the
payment's `webhookUrl`. On any call, re-fetch the payment (and, if needed, its
refunds/chargebacks) to see what changed.

## Event Payload Structure

The **webhook request** contains only:

```
id=tr_5B8cwPMGnU6qLbRvo7qEZo
```

The **fetched payment** (`GET /v2/payments/{id}`) contains the real data:

```json
{
  "resource": "payment",
  "id": "tr_5B8cwPMGnU6qLbRvo7qEZo",
  "status": "paid",
  "amount": { "currency": "EUR", "value": "10.00" },
  "metadata": { "order_id": "12345" },
  "paidAt": "2026-07-02T09:12:34+00:00"
}
```

Put your own `order_id` (or similar) in `metadata` when you create the payment so
you can reconcile it in the webhook handler.

## Full Event Reference

- [Mollie webhooks documentation](https://docs.mollie.com/docs/webhooks)
- [Payment status changes](https://docs.mollie.com/docs/payment-status-changes)
- [Get payment API reference](https://docs.mollie.com/reference/get-payment)
