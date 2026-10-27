# Hyperswitch Webhooks Overview

## What Are Hyperswitch Webhooks?

Hyperswitch (Juspay's open-source payments switch) sends **outgoing webhooks**
to your server so you don't have to poll for state changes. Each delivery is an
HTTP `POST` with a JSON body. You configure one endpoint per business profile
and mode (test or live).

Hyperswitch's webhook guide covers two directions. **Incoming** webhooks are
the connector's (payment processor's) callbacks into Hyperswitch, which
Hyperswitch verifies and uses to update a payment, refund or dispute. Those are
out of scope here. **Outgoing** webhooks, where Hyperswitch calls you, are what
this skill handles.

## Which Events Does Hyperswitch Send? (`event_type`)

The v1 API schema lists 33 `event_type` wire values:

| Group | `event_type` | Common use |
|---|---|---|
| Payment | `payment_succeeded` | Fulfil the order |
| | `payment_failed` | Notify the customer, offer retry |
| | `payment_processing` | Mark the order pending |
| | `payment_cancelled`, `payment_cancelled_post_capture` | Release stock |
| | `payment_authorized`, `payment_partially_authorized` | Manual-capture flows |
| | `payment_captured` | Funds captured |
| | `payment_expired` | Expire the order |
| | `action_required` | Customer must complete an action (for example 3DS) |
| Refund | `refund_succeeded`, `refund_failed`, `refund_review` | Update refund state |
| Dispute | `dispute_opened`, `dispute_expired`, `dispute_accepted`, `dispute_cancelled`, `dispute_challenged`, `dispute_won`, `dispute_lost` | Evidence workflow |
| Mandate | `mandate_active`, `mandate_revoked` | Recurring-payment consent |
| Payout | `payout_success`, `payout_failed`, `payout_initiated`, `payout_processing`, `payout_cancelled`, `payout_expired`, `payout_reversed`, `payout_not_permitted` | Payout state |
| Other | `invoice_paid`, `surcharge_payment_succeeded`, `surcharge_refund_succeeded` | Billing and surcharge |

## Event Payload Structure

The outgoing webhook object has six fields:

| Field | Required | Notes |
|---|---|---|
| `merchant_id` | Yes | |
| `event_id` | Yes | Unique per event; use it to dedupe |
| `event_type` | Yes | One of the values above |
| `content` | Yes | `{ type, object }` |
| `timestamp` | No | |
| `processor_merchant_id` | No | Nullable |

`content.type` is one of `payment_details`, `refund_details`,
`dispute_details`, `mandate_details`, `payout_details` or
`subscription_details`, and the matching resource is in `content.object`. It's
a coarser sub-discriminator, not the event: dispatch on `event_type`.

The guide publishes no example body. The pairing of the `event_type` field with
the list above comes from the page, but no documented payload shows a value in
the field, so check a real test delivery. See Hyperswitch's outgoing webhook
schema for each resource shape.

## Delivery and Retries

A delivery succeeds when your endpoint returns a `2xx`. Otherwise Hyperswitch
makes **16 retries over roughly 24 hours**:

| Retry | Delay |
|---|---|
| 1st | 1 minute after the original attempt |
| 2nd and 3rd | 5 minutes |
| 4th to 8th | 10 minutes |
| 9th to 13th | 1 hour |
| 14th to 16th | 6 hours |

The docs state no request timeout, so respond quickly and do heavy work
asynchronously.

- **Duplicates are possible.** Store `event_id` and make processing
  idempotent. If an `event_id` already completed, acknowledge without applying
  the change again.
- **Order isn't guaranteed.** For payment webhooks, compare
  `content.object.updated` with the stored value and apply only the newer
  state. The v1 schema doesn't define `updated` on every other resource shape.

## Full Event Reference

See [Hyperswitch's webhook documentation](https://docs.hyperswitch.io/integration-guide/webhooks).
