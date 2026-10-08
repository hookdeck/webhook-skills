# Mollie Webhooks Overview

## What Are Mollie Webhooks?

Mollie is a European payments platform. When something changes on Mollie's side
(most commonly a **payment** status), Mollie notifies your server with an HTTP
**POST**. Mollie runs two webhook systems side by side, and they work very
differently.

### Classic webhooks

You set a `webhookUrl` when you create a resource (a payment, order,
subscription or payment link), and Mollie calls it whenever that resource
changes. A classic webhook is intentionally minimal and **carries no status and
no signature**. It is a POST with `Content-Type: application/x-www-form-urlencoded`
and a **single** body parameter:

```
id=tr_5B8cwPMGnU6qLbRvo7qEZo
```

You are expected to take that `id` and **fetch the resource from the Mollie API**
to read its authoritative status. See [verification.md](verification.md) for the
fetch-to-confirm pattern.

Because a classic webhook never transmits the status, a forged one is harmless:
the worst an attacker can do is make you re-fetch a real payment that you own. As
Mollie puts it, "fake calls to your webhook will never result in orders being
processed without being actually paid." Do **not** rely on IP allowlists either:
Mollie recommends against it because its webhook source IPs change over time.

### Next-gen webhooks

You create a webhook **subscription** once (Dashboard **Developers → Webhooks**,
or `POST /v2/webhooks`), choosing the `eventTypes` you want. Mollie then POSTs a
JSON **event** for each matching change, signed with an `X-Mollie-Signature`
header (`sha256=<hex HMAC-SHA256 of the raw body>`). See
[verification.md](verification.md#next-gen-webhooks-signature-verification).

Mollie recommends a separate URL for each system. If one URL must accept both,
tell them apart by the `X-Mollie-Signature` header, which only next-gen
deliveries carry.

## Common Payment Statuses (classic)

The classic webhook fires on each status change. After fetching the payment, act on
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

With classic webhooks, refunds and chargebacks do **not** get their own webhook —
they reuse the payment's `webhookUrl`. On any call, re-fetch the payment (and, if needed, its
refunds/chargebacks) to see what changed.

## Event Payload Structure

### Classic

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

### Next-gen

The request body is an event object. Mollie's documented example (full payload,
with the payment link snapshot under `_embedded.entity`, abridged here):

```json
{
  "resource": "event",
  "id": "event_GvJ8WHrp5isUdRub9CJyH",
  "type": "payment-link.paid",
  "entityId": "pl_qng5gbbv8NAZ5gpM5ZYgx",
  "createdAt": "2024-12-09T14:02:31.0Z",
  "_embedded": {
    "entity": {
      "id": "pl_qng5gbbv8NAZ5gpM5ZYgx",
      "profileId": "pfl_D96wnsu869",
      "mode": "live",
      "description": "Bicycle tires",
      "amount": { "currency": "EUR", "value": "24.95" }
    }
  },
  "_links": {
    "self": { "href": "https://api.mollie.com/v2/events/event_GvJ8WHrp5isUdRub9CJyH", "type": "application/hal+json" }
  }
}
```

Mollie also offers a **simple** payload with the same top-level fields and no
`_embedded` snapshot ("basic information, such as identifiers and event type").
Its docs associate the full payload with the public API and the simple payload
with the Dashboard or app, so handle both: branch on `type`, and use `entityId`
to find the object when `_embedded` is absent.

## Next-gen Event Types

Listed by Mollie as global (available on all accounts):

| Event type | Description |
|------------|-------------|
| `payment.authorized` | Payment authorized; capturable |
| `payment.canceled` | Customer canceled the payment |
| `payment.expired` | Payment expired |
| `payment.failed` | Payment failed |
| `payment.paid` | Customer completed the payment |
| `payment.pending` | Payment started, not complete yet |
| `payment-link.paid` | A payment link moved to `paid` |
| `balance-transaction.created` | A balance transaction was created |
| `business-account-transfer.requested` / `.initiated` / `.pending-review` / `.processed` / `.failed` / `.blocked` / `.returned` | Business account transfer lifecycle |
| `payout.initiated` / `.processing-at-bank` / `.completed` / `.failed` / `.canceled` | Payout lifecycle |
| `sales-invoice.created` / `.issued` / `.paid` / `.canceled` | Sales invoice lifecycle |

Listed as **beta** (contact Mollie support for access): `capture.*`,
`chargeback.*`, `connect-balance-transfer.*`, `dispute.*`, `file.*`, `refund.*`
and `unmatched-credit-transfer.*`.

Note: the same Mollie page lists the `payment.*` types as global events but, in
its "Classic Mollie webhooks" section, still recommends classic webhooks for
payment-related updates "until we make these event types available for Next-gen
webhooks". Check the current page before relying on next-gen alone for payments.

## Full Event Reference

- [Mollie classic webhooks](https://docs.mollie.com/reference/webhooks)
- [Mollie next-gen webhooks](https://docs.mollie.com/reference/webhooks-new)
- [Payment status changes](https://docs.mollie.com/docs/payment-status-changes)
- [Get payment API reference](https://docs.mollie.com/reference/get-payment)
