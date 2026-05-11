# PayPal Webhooks Overview

## What Are PayPal Webhooks?

PayPal webhooks are HTTPS POST requests that PayPal sends to your server when
events occur on a merchant account — payment captures, refunds, subscription
state changes, dispute creation, and more. You register a webhook URL and the
list of event types you care about against a REST app inside the PayPal
Developer Dashboard, and PayPal then signs each transmission with its private
key so that you can verify authenticity.

Unlike most webhook providers (Stripe, Shopify, GitHub), PayPal does **not**
use a shared HMAC secret. Signatures are RSA-SHA256 produced with PayPal's
private key and verified against a per-request public certificate. See
[verification.md](verification.md) for the full algorithm.

## Common Event Types

These are the most-handled events. The full list lives at
[developer.paypal.com/api/rest/webhooks/event-names/](https://developer.paypal.com/api/rest/webhooks/event-names/).

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `PAYMENT.CAPTURE.COMPLETED` | A capture on an order completes | Fulfill the order, send receipt |
| `PAYMENT.CAPTURE.DENIED` | A capture was denied | Notify customer, mark order failed |
| `PAYMENT.CAPTURE.REFUNDED` | A capture was refunded by the merchant | Reverse fulfillment, update ledger |
| `PAYMENT.CAPTURE.REVERSED` | A capture was reversed (chargeback / risk) | Reverse fulfillment, alert finance |
| `PAYMENT.SALE.COMPLETED` | A sale completed (legacy Payments API) | Fulfill the order |
| `PAYMENT.SALE.REFUNDED` | A sale was refunded (legacy) | Reverse fulfillment |
| `CHECKOUT.ORDER.APPROVED` | A buyer approved a checkout order | Capture the payment server-side |
| `CHECKOUT.ORDER.COMPLETED` | A checkout order finished processing | Provision the order |
| `BILLING.SUBSCRIPTION.CREATED` | A subscription was created (pending activation) | Track lifecycle, await activation |
| `BILLING.SUBSCRIPTION.ACTIVATED` | A subscription became active | Provision access |
| `BILLING.SUBSCRIPTION.CANCELLED` | A subscription was cancelled | Revoke access at period end |
| `BILLING.SUBSCRIPTION.SUSPENDED` | A subscription was suspended | Pause access, notify customer |
| `CUSTOMER.DISPUTE.CREATED` | A dispute was opened by a buyer | Alert ops, gather evidence |
| `INVOICING.INVOICE.PAID` | An invoice was paid in full | Mark invoice settled |

> Event names are **dot-separated UPPER_CASE** strings. Match them exactly —
> `payment.capture.completed` (lowercase) will not match.

## Event Payload Structure

Every PayPal webhook event has the same top-level shape:

```json
{
  "id": "WH-COM47..." ,
  "event_version": "1.0",
  "create_time": "2024-08-22T18:23:10.123Z",
  "resource_type": "capture",
  "event_type": "PAYMENT.CAPTURE.COMPLETED",
  "summary": "Payment completed for $ 10.0 USD",
  "resource": {
    "id": "3C679367HH908",
    "status": "COMPLETED",
    "amount": { "currency_code": "USD", "value": "10.00" }
  },
  "links": [
    { "href": "...", "rel": "self", "method": "GET" },
    { "href": "...", "rel": "resend", "method": "POST" }
  ]
}
```

Key fields:

- `id` — Webhook event ID (use this as your idempotency key).
- `event_type` — The dot-separated event name; switch on this.
- `resource_type` — The kind of object in `resource` (e.g. `capture`, `sale`,
  `subscription`, `dispute`).
- `resource` — The actual resource payload. Shape varies per `resource_type`.
- `create_time` — When PayPal generated the event (UTC).

## Sandbox vs. Live

- Sandbox events come from a webhook configured against a **sandbox** app and
  are signed with a sandbox cert (host `api.sandbox.paypal.com`).
- Live events come from a **live** app and are signed with a live cert
  (host `api.paypal.com`).
- Each environment has its own `PAYPAL_WEBHOOK_ID`. Don't mix them.

## Retries

PayPal retries failed deliveries with exponential backoff for up to 3 days
(after which the event is marked failed and can be replayed manually from the
Webhook Events dashboard). Return `2xx` quickly — see
[webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns)
for async processing patterns.

## Full Event Reference

See [PayPal Webhook Event Names](https://developer.paypal.com/api/rest/webhooks/event-names/).
