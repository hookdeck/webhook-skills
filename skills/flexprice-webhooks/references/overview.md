# Flexprice Webhooks Overview

## What Are Flexprice Webhooks?

[Flexprice](https://flexprice.io) is open-source usage-based billing: customers, subscriptions,
invoices, payments, wallets, entitlements, checkout and usage ingestion. It sends an HTTPS `POST`
to an endpoint you register when something changes in your account. On Flexprice Cloud, deliveries
go through Svix and are signed. A self-hosted instance signs only when Svix is enabled in its
configuration (see [setup.md](setup.md)).

| Aspect | Value |
|--------|-------|
| Method | `POST`, JSON body |
| Signature headers | `svix-id`, `svix-timestamp`, `svix-signature` (Standard Webhooks) |
| Success | Any `2xx` within 5 seconds |
| Delivery | At-least-once, sent in order but may arrive out of order |

## Event Payload Structure

Every payload has the same envelope: `event_type`, plus one resource-named key holding the
changed object. The object is not under `data`.

```json
{
  "event_type": "invoice.update.finalized",
  "invoice": {
    "id": "inv_01J...",
    "customer_id": "cust_01J...",
    "subscription_id": "sub_01J...",
    "invoice_status": "FINALIZED",
    "payment_status": "PENDING",
    "currency": "USD",
    "amount_due": "149.00"
  }
}
```

Read the current status from the object (`invoice.invoice_status`, `invoice.payment_status`),
not from the event name, because messages can arrive out of order. Each object carries `id` and
`updated_at`.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `customer.created` | A customer is created | Mirror customers into your app |
| `customer.updated` | A customer is updated | Keep records in sync |
| `customer.deleted` | A customer is deleted | Deprovision |
| `subscription.created` | A subscription is created | Provision access |
| `subscription.activated` | A draft subscription is activated | Provision access |
| `subscription.updated` | Quantity, billing anchor or metadata changes | Sync plan state |
| `subscription.plan_changed` | A subscription moves to another plan in place | Change entitlements |
| `subscription.cancelled` | A subscription is cancelled | Deprovision |
| `invoice.update.finalized` | An invoice is finalized and locked for payment | Send or sync the invoice |
| `invoice.update.payment` | An invoice's payment status changes | Mark paid / unpaid |
| `invoice.update.voided` | An invoice is voided | Reverse bookkeeping |
| `invoice.payment.overdue` | An invoice is past its due date | Dunning |
| `payment.success` | A payment succeeds | Confirm fulfilment |
| `payment.failed` | A payment fails | Notify the customer |
| `wallet.credit_balance.dropped` | A wallet's credit balance drops below an alert threshold | Low-credit warning |
| `checkout.session.completed` | Payment confirmed; subscription active, invoice finalized | Complete the signup |
| `event.rejected` | A usage event matched no meter and was dropped | Catch metering mistakes |

The examples handle exactly these events and acknowledge anything else with `200`.

## Full Event List (60 documented)

- **Customer:** `customer.created`, `customer.updated`, `customer.deleted`
- **Subscription:** `subscription.created`, `subscription.draft.created`, `subscription.activated`,
  `subscription.updated`, `subscription.paused`, `subscription.cancelled`, `subscription.resumed`,
  `subscription.plan_changed`, `subscription.phase.created`, `subscription.phase.updated`,
  `subscription.phase.deleted`, `subscription.spend.threshold_reached`,
  `subscription.spend.threshold_recovered`, `subscription.line_item_spend.threshold_reached`,
  `subscription.line_item_spend.threshold_recovered`, `subscription.group_spend.threshold_reached`,
  `subscription.group_spend.threshold_recovered`, `subscription.renewal.due`
- **Invoice:** `invoice.update.finalized`, `invoice.update.payment`, `invoice.update.voided`,
  `invoice.update`, `invoice.payment.overdue`, `invoice.communication.triggered`
- **Payment and refund:** `payment.created`, `payment.updated`, `payment.failed`, `payment.success`,
  `payment.pending`, `refund.created`, `refund.succeeded`, `refund.failed`
- **Credit note:** `credit_note.created`, `credit_note.updated`
- **Wallet:** `wallet.created`, `wallet.updated`, `wallet.terminated`, `wallet.transaction.created`,
  `wallet.transaction.updated`, `wallet.credit_balance.dropped`, `wallet.credit_balance.recovered`,
  `wallet.ongoing_balance.dropped`, `wallet.ongoing_balance.recovered`, `wallet.ongoing_balance.updated`
- **Feature and entitlement:** `feature.created`, `feature.updated`, `feature.deleted`,
  `feature.wallet_balance.alert`, `entitlement.created`, `entitlement.updated`,
  `entitlement.deleted`, `entitlement.grant.exhausted`
- **Checkout:** `checkout.session.initiated`, `checkout.session.completed`,
  `checkout.session.failed`, `checkout.session.expired`
- **Usage ingestion:** `event.rejected`

Threshold events come in pairs: `threshold_reached` or `dropped` fires when a value crosses the
line, and the matching `recovered` event fires when it crosses back.

## Retries and Ordering

Flexprice Cloud (Svix) retries any non-`2xx` response, timeout, or connection error: immediately,
then after 5 seconds, 5 minutes, 30 minutes, 2 hours, 5 hours, 10 hours and 10 hours, about 28
hours in total. There is no special `4xx` handling and `410 Gone` does not disable the endpoint.
Endpoints that keep failing for several days are disabled. Self-hosted native delivery retries 3
times within 2 minutes. Deduplicate on `svix-id` (keep it for at least three days), make effects
idempotent, and compare `updated_at` before overwriting stored state.

## Full Event Reference

For payload schemas, see Flexprice's [event catalog](https://docs.flexprice.io/developers/webhooks/event-catalog)
and [webhook documentation](https://docs.flexprice.io/developers/webhooks/set-up-an-endpoint).
