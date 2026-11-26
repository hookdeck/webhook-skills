# Airwallex Webhooks Overview

## What Are Airwallex Webhooks?

Airwallex sends webhooks to notify your application about events that happen in
your account — a PaymentIntent succeeding, a refund settling, a dispute being
raised, and more. Instead of polling the API, you register an HTTPS endpoint and
Airwallex POSTs a JSON payload to it whenever a subscribed event occurs.

Webhooks are signed once the webhook has a secret, so you can verify they came
from Airwallex. See
[verification.md](verification.md) for the signing scheme and
[setup.md](setup.md) for configuring an endpoint.

## Event Payload Structure

Airwallex webhook payloads share a common envelope:

```json
{
  "id": "evt_100_2019102201540902013102020043_8321220011893766",
  "name": "payment_attempt.authorized",
  "account_id": "19621303213",
  "data": {
    "object": {...}
  },
  "created_at": "2019-10-22T01:54:09+0000",
  "version": "2024-02-22"
}
```

(The envelope example from Airwallex's
[Listen for webhook events](https://www.airwallex.com/docs/developer-tools/webhooks/listen-for-webhook-events)
page; `data.object` matches the resource's Retrieve API response.)

Key fields:

| Field | Meaning |
|-------|---------|
| `id` | Unique event ID. **Use this for idempotency** — Airwallex re-sends the same `id` on retry. |
| `name` | The event type string (e.g. `payment_intent.succeeded`). **Not** `type`. |
| `account_id` | The account the event belongs to (may be empty for non-account-level events). |
| `org_id` | The organization the event belongs to, for organization-level events (may be empty). |
| `data.object` | The business resource that changed (a PaymentIntent, refund, dispute, etc.). Several non-payments products put the resource's fields directly in `data`. |
| `version` | The subscription's API version, which decides the event names and the content of `data`. |
| `created_at` | When the event was generated. Airwallex does **not** guarantee delivery in generation order — sort by `created_at` if ordering matters. |

## Common Event Types

Event names are dot-namespaced by resource. The full set for Online Payments:

### `payment_intent.*`
| Event | Triggered When |
|-------|----------------|
| `payment_intent.created` | A PaymentIntent is created |
| `payment_intent.requires_payment_method` | The PaymentIntent needs a payment method to continue |
| `payment_intent.updated` | A PaymentIntent is updated |
| `payment_intent.requires_capture` | Funds are authorized and awaiting capture |
| `payment_intent.requires_customer_action` | Customer action (e.g. 3DS) is needed |
| `payment_intent.pending` | The PaymentIntent is pending |
| `payment_intent.pending_review` | Under review |
| `payment_intent.succeeded` | Fully paid |
| `payment_intent.cancelled` | Cancelled |
| `payment_intent.payment_failed` | An attempt on the PaymentIntent failed |

### `payment_attempt.*`
| Event | Triggered When |
|-------|----------------|
| `payment_attempt.received` | An attempt is received |
| `payment_attempt.authentication_failed` | Authentication (e.g. 3DS) failed |
| `payment_attempt.authentication_redirected` | Redirected for authentication |
| `payment_attempt.pending_authorization` | Awaiting authorization |
| `payment_attempt.authorization_failed` | Authorization failed |
| `payment_attempt.authorized` | Authorized |
| `payment_attempt.capture_requested` | Capture requested |
| `payment_attempt.settled` | Settled |
| `payment_attempt.paid` | Captured/paid |
| `payment_attempt.cancelled` | Cancelled |
| `payment_attempt.expired` | Expired |
| `payment_attempt.risk_declined` | Declined by risk controls |
| `payment_attempt.failed_to_process` | Failed to process |
| `payment_attempt.capture_failed` | Capture failed |

### `refund.*`
| Event | Triggered When |
|-------|----------------|
| `refund.received` | A refund request is received |
| `refund.accepted` | A refund is accepted |
| `refund.settled` | A refund has settled |
| `refund.failed` | A refund failed |

> Note: there is **no** `refund.processed` event — use `refund.settled`.

### `payment_consent.*`
| Event | Triggered When |
|-------|----------------|
| `payment_consent.created` | A consent (recurring/MIT mandate) is created |
| `payment_consent.updated` | Updated |
| `payment_consent.pending` | Pending |
| `payment_consent.verified` | Verified and usable |
| `payment_consent.disabled` | Disabled |
| `payment_consent.paused` | Paused |
| `payment_consent.requires_payment_method` | Needs a payment method |
| `payment_consent.requires_customer_action` | Needs customer action |
| `payment_consent.verification_failed` | Verification failed |

### `payment_dispute.*`
| Event | Triggered When |
|-------|----------------|
| `payment_dispute.requires_response` | A dispute needs an evidence response |
| `payment_dispute.challenged` | The dispute has been challenged |
| `payment_dispute.accepted` | The dispute was accepted |
| `payment_dispute.expired` | The response window expired |
| `payment_dispute.pending_closure` | Pending closure |
| `payment_dispute.pending_decision` | Awaiting decision |
| `payment_dispute.won` | You won the dispute |
| `payment_dispute.lost` | You lost the dispute |
| `payment_dispute.reversed` | The dispute was reversed |

> Dispute events use the `payment_dispute.*` namespace — **not** `dispute.*`.

## Delivery, Retries & Ordering

- **Retries:** Any response other than `200 OK`, or a timeout, is retried with
  exponential back-off over roughly three days. Return `200` fast (do heavy work
  asynchronously).
- **Idempotency:** Retries carry the same event `id`. De-duplicate on `id`.
- **Ordering:** Not guaranteed. Use `created_at` if order matters.
- **Re-trigger:** Re-deliver past events from Settings → Developer → Events, for
  up to 30 days after they occurred.

## Full Event Reference

This file lists Online Payments only. Airwallex also sends events for Payouts
(`payout.transfer.*`, `payout.batch_transfers.*`), Issuing (`issuing.*`), Billing,
Spend, Connected Accounts, deposits, conversions and more. Each product has its
own event-type page under
[Listen for webhook events](https://www.airwallex.com/docs/developer-tools/webhooks/listen-for-webhook-events),
and the subscription's API version decides which names you receive.
