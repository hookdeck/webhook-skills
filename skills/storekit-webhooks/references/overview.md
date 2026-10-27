# Storekit Webhooks Overview

## What Are Storekit Webhooks?

Storekit notifies your systems of store activity (orders, refunds, store status, menu
availability, payouts, payment links, cloud printers) with an HTTP `POST` to an endpoint you
register in the dashboard. Delivery is handled by [Svix](https://www.svix.com/), so requests carry
`svix-id`, `svix-timestamp` and `svix-signature` headers and the signature follows Standard
Webhooks. You normally use one endpoint per service and subscribe it to all event types.

## Payload Shapes

Every payload is JSON (`Content-Type: application/json`):

```json
{
  "event": "order.created.v2",
  "data": { "id": "ord_abc123", "code": "A1B2", "total": 2500, "orderType": "Pickup" }
}
```

Monetary values are in the smallest currency unit (pence, cents) and timestamps are ISO 8601 UTC.
Two documented exceptions to the `{event, data}` shape:

- **`order.refund.*`** events have no `data`. `order` (`id`, `total`), `customer` (`id`, `name`,
  `email`), `venue` and `refund` (`status`, `amount`, `totalAmountRefunded`, `reason`) sit beside
  `event`. `customer.id` and `refund.reason` are `null` when unavailable.
- **The legacy `order.created`** event sends the order object as the top-level body, with no
  `event` and no `data`. Both it and `order.created.v2` are sent for every new order. Use
  `order.created.v2` in new integrations.

The body carries no event id. `svix-id` is the message id, unchanged across retries.

## Common Event Types

27 events are documented (the list may not be exhaustive). The name is the top-level `event`.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `order.created.v2` | A new order is placed | Send to kitchen or POS, notify staff |
| `order.created` | Legacy form of the same event (bare order body) | Existing integrations only |
| `order.accepted` | Accepted at a store with Auto-accept off (adds `status`, `acceptedAt`) | Confirm to customer |
| `order.rejected` | Rejected at a store with Auto-accept off (adds `status`, `rejectedAt`) | Notify customer, refund from the dashboard |
| `order.canceled` | An order is canceled (`data.order.status`) | Stop preparation |
| `order.preparing` | An order moves to preparing | Progress display |
| `order.ready_for_pickup` | An order is marked ready for pickup | Notify the customer |
| `order.out_for_delivery` | A delivery order is dispatched | Delivery tracking |
| `order.completed` | An order is marked completed (including bulk completions) | Close out the ticket |
| `order.pos.dispatch.failed` | An order failed to reach the POS (`pos.name`, `pos.error`, `retryCount`) | Alert staff |
| `order.rating.updated` | A customer submits or updates a rating (`rating`, `comments`) | Feedback tracking |
| `order.refund.created` | A refund is issued from the dashboard | Accounting |
| `order.refund.succeeded` | The payment gateway confirms the refund | Mark refunded |
| `order.refund.failed` | The payment gateway rejects the refund | Follow up |
| `store.opened` | A store opens, a snooze ends early, or a timed snooze expires | Sync availability |
| `store.closed` | A store closes or is snoozed (`closedReason`, `closedUntil`, empty strings if unset) | Sync availability |
| `store.opening_hours.updated` | Opening hours change (`openingHours`, `specialHours`, `source`) | Sync listings |
| `item.out_of_stock` | A menu item becomes unavailable (`reason`, `source`, `details`) | Update external menus |
| `payments.payout.created` | A payout is sent to your bank account (`amounts`, `bankAccount`) | Reconciliation |
| `bill.payment.created` | A bill payment is created | Reconciliation (no payload shown in the docs) |
| `payment_link.created` | A payment link is created (`paymentLink`) | Track links |
| `payment_link.paid` | A payment link payment is collected (`payment.transactionId`, `amount`) | Mark invoice paid |
| `payment_link.refund.created` | A payment link refund is initiated (pending) | Accounting |
| `payment_link.refund.succeeded` | The gateway confirms the refund | Mark refunded |
| `payment_link.refund.failed` | The gateway rejects the refund | Follow up |
| `printer.status.offline` | A cloud printer misses check-ins for 5 minutes | Alert staff |
| `printer.status.online` | A printer reconnects after being offline for at least 5 minutes | Clear the alert |

The examples handle exactly these 27 events and acknowledge anything else with `200`. The
`order.created` payload has no `event` field, so the examples treat a body with `id`,
`orderType` and `items` and no `event` as `order.created`.

## Accepting or Rejecting From the Webhook

When a store has **Auto-accept** off, `order.created.v2` (in `data.actions`) and `order.created`
(top level `actions`) carry `accept` and `reject` links. A `POST` with no body to a link accepts or
rejects the order; the link itself is the credential, so don't log it. Links expire 1 hour after
the webhook is sent, and a retried delivery carries the original links, so they may already be
expired (`410`), or already used (`409`).

## Delivery Rules Worth Planning For

- **Acknowledge fast.** Return a `2xx` within 15 seconds and process on a queue.
- **At-least-once.** Duplicates happen. Deduplicate on `svix-id` and keep ids at least 72 hours.
- **Retries over about 3 days** after a non-2xx, a timeout or a connection failure. See
  [setup.md](setup.md) for the schedule.
- **No ordering statement.** Don't assume `order.preparing` arrives before `order.completed`.
- **Endpoints can be disabled** after 5 consecutive days of failures.

## Full Event Reference

See Storekit's [webhook events](https://storekit.com/docs/developers/webhooks/webhook-events)
and [payload format](https://storekit.com/docs/developers/webhooks/payload-format) pages for every
payload shape.
