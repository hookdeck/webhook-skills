# Checkout Page Webhooks Overview

## What Are Checkout Page Webhooks?

[Checkout Page](https://checkoutpage.com) is a hosted checkout, booking and form builder. It sends
two kinds of webhooks:

- **Store-level webhooks** (Store settings > Integrations > Webhooks) send signed
  `<resource>.<action>` events such as `payment.paid`. These are what this skill covers.
- **Page-level webhooks** (a page's After payment > Integrations) send a separate `conversion`
  event with a different body (`object`, `data.fields`, ...). They are not covered by the store
  signature scheme described here.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `payment.created` | A payment is started | Track pending orders |
| `payment.paid` | A payment succeeds | Fulfil orders, grant access |
| `payment.abandoned` | A payment is abandoned | Recovery emails |
| `booking.created` | A booking is made | Calendar / CRM sync |
| `booking.paid` | A booking is paid | Confirm the booking |
| `booking.abandoned` | A booking is abandoned | Follow-up |
| `subscription.created` | A subscription is created | Provision account |
| `subscription.trialing` | A subscription enters a trial | Trial onboarding |
| `subscription.scheduled` | A subscription is scheduled | Prepare start |
| `subscription.active` | A subscription becomes active | Enable features |
| `subscription.completed` | A subscription completes | Wind down |
| `subscription.canceled` | A subscription is canceled | Revoke access at period end |
| `subscription.expired` | A subscription expires | Revoke access |
| `subscription.abandoned` | A subscription checkout is abandoned | Follow-up |
| `customer.created` / `customer.updated` | A customer is created or changed | Sync to CRM |
| `submission.created` / `submission.updated` | A form submission is created or changed | Lead capture |
| `ticket.created` | A ticket is issued | Send tickets |
| `product.created` / `product.updated` | A product changes | Catalog sync |
| `checkout_page.created` / `checkout_page.updated` | A checkout page changes | Audit |

That is the full documented list of 23 events.

## Event Payload Structure

```json
{
  "sellerId": "...",
  "timestamp": "...",
  "eventId": "...",
  "event": "payment.paid",
  "data": { "payment": { } }
}
```

- `event` carries the type; no header names it.
- `data` holds the resource under its own key (e.g. `data.booking`).
- `seller_id` and `event_id` are deprecated duplicates of `sellerId` and `eventId`.
- Deliveries may be retried: dedupe on `eventId`. `x-webhook-delivery-attempt` is the attempt number.

## Full Event Reference

See the event pages linked from [Checkout Page's webhook documentation](https://checkoutpage.com/docs/api/v1/webhooks/signature).
