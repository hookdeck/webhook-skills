# Checkout.com Webhooks Overview

## What Are Checkout.com Webhooks?

Checkout.com is a global payments processor (card acquiring, alternative payment
methods, disputes, payouts, issuing, identity verification). Webhooks are how it
tells your server that something happened asynchronously — a payment was
approved, a capture settled, a dispute was raised, a refund went through.

On the current ("NAS") platform, a webhook is a **workflow action**. You either
create it in the Dashboard (**Developers → Webhooks**), which builds the
workflow for you, or you `POST` a workflow with a `webhook` action to
`https://{prefix}.api.checkout.com/workflows`. Either way, the delivery is a
`POST` of a JSON event envelope to your URL, signed with `Cko-Signature`.

> **Identity check.** This is Checkout.com (checkout.com). It is **not**
> Checkout Page (checkoutpage.com), **not** CheckoutJoy, **not** 2Checkout /
> Verifone (a different company with an entirely different INS/IPN scheme),
> **not** Stripe Checkout, and **not** Shopify's checkout webhooks.

## Event Payload Structure

Every event shares the same envelope:

```json
{
  "id": "evt_caxmnvuvbe4elkbdx2imwbnjxu",
  "type": "payment_approved",
  "version": "1.0.29",
  "created_on": "2023-05-22T11:56:04.8821546Z",
  "data": {
    "id": "pay_griq7wyqkggu7mnk7ecm6ysrl4",
    "action_id": "act_gl5cpqgccxeulozrvaassd4lta",
    "reference": "ORD-5023-4E89",
    "amount": 20,
    "currency": "USD",
    "response_code": "10000",
    "response_summary": "Approved",
    "metadata": { "coupon_code": "NY2018" }
  },
  "_links": {
    "self": { "href": "https://{prefix}.api.checkout.com/workflows/events/evt_caxmnvuvbe4elkbdx2imwbnjxu" }
  }
}
```

| Field | Notes |
|---|---|
| `id` | The **event** id, prefixed `evt_`. Your idempotency key. |
| `type` | snake_case event name (see below). Never dotted. |
| `version` | Event **schema** version, e.g. `"1.0.29"` — not an API version. |
| `created_on` *or* `timestamp` | **The field name varies by event.** Read `created_on ?? timestamp`. |
| `data` | Event-specific body. |
| `_links.self.href` | The workflow-events API URL for this event. |
| `source` | Present on some events. |
| `action_invocations` | Present on some events: `workflow_id`, `workflow_action_id`, `status`. |

### Why does `created_on` sometimes not exist?

Because Checkout.com's own documented examples are inconsistent:
`payment_approved` and `dispute_received` carry **`created_on`**, while
`payment_captured` carries **`timestamp`**. Both are ISO-8601 strings. Handlers
that read only `created_on` log `undefined` on capture events. Always:

```javascript
const occurredAt = event.created_on ?? event.timestamp;
```

```python
occurred_at = event.get("created_on") or event.get("timestamp")
```

### `data.id` is not always a payment

- **Payment/gateway events** — `data.id` is the payment, `pay_…`. `data.action_id`
  is the specific action (`act_…`).
- **Dispute events** — `data.id` is the dispute, `dsp_…`, and `data.payment_id`
  points at the payment it disputes.

### `amount` is in the minor currency unit

`{"amount": 20, "currency": "USD"}` is **$0.20**. For a two-decimal currency,
divide by 100. Zero-decimal currencies (JPY, KRW) and three-decimal ones
(BHD, KWD, TND) have different exponents — use the currency's exponent, not a
hardcoded `/100`, if you handle more than one.

## Common Event Types

Event names are **snake_case strings with no dots**. There is no
`payment.captured`, no `charge.succeeded`.

### Gateway (payments)

| Event | Triggered when | Common use |
|---|---|---|
| `payment_approved` | Authorization succeeded | Mark the order authorized |
| `payment_declined` | Authorization was declined | Show a failure, prompt retry |
| `payment_pending` | Payment is awaiting a next step | Hold the order |
| `payment_captured` | Funds were captured | **Fulfil the order** |
| `payment_capture_declined` | Capture attempt failed | Alert ops, retry capture |
| `payment_capture_pending` | Customer approved the payment on their banking page; capture not final yet | Wait |
| `payment_paid` | A bank payout completed successfully | Mark the payout paid |
| `payment_refunded` | A refund succeeded | Credit the customer, update ledger |
| `payment_refund_declined` | Refund failed | Alert ops |
| `payment_refund_pending` | Refund in flight | Wait |
| `payment_voided` | Authorization was voided | Release the order |
| `payment_void_declined` | Void failed | Alert ops |
| `payment_canceled` | Customer canceled on the APM provider's platform | Release the order |
| `payment_expired` | An APM payment expired (not 3DS expiries) | Release the order |
| `payment_returned` | A Pay to Bank / APM payment was returned after success (e.g. ACH) | Reverse the ledger entry |
| `payment_authorization_incremented` | Auth amount increased | Update the held amount |
| `payment_authorization_increment_declined` | Increment failed | Cap the order value |
| `card_verified` | Card verification (zero-auth) succeeded | Store the instrument |
| `card_verification_declined` | Card verification failed | Ask for another card |

### Disputes

| Event | Triggered when |
|---|---|
| `dispute_received` | A dispute (chargeback) was raised |
| `dispute_evidence_required` | Evidence is needed before the deadline |
| `dispute_evidence_submitted` | You submitted evidence for the dispute |
| `dispute_accepted` | You accepted the dispute |
| `dispute_won` | The dispute resolved in your favour |
| `dispute_lost` | The dispute resolved against you |
| `dispute_expired` | The response window closed |
| `dispute_canceled` | The issuer canceled the dispute |
| `dispute_resolved` | No action needed — you had already refunded the customer |

### Fraud and authentication

| Event | Triggered when |
|---|---|
| `fraud_reported` | A payment was reported as fraudulent |
| `authentication_approved` | 3DS authentication succeeded |
| `authentication_failed` | 3DS authentication failed |

## Full Event Reference

The [Event types](https://www.checkout.com/docs/developer-resources/event-notifications/event-types)
page lists **140+** events, grouped: Authentication, Balances,
Compliance, Disputes, Fraud, Gateway, Identities, Issuing, Network tokens,
Platforms, Real-Time Account Updater, Reports, Settlements. Subscribe only to the events you
actually handle — an unsubscribed event is one you never have to dispatch.

## Idempotency: Deduplicate on `id`

Delivery is **at-least-once**. The same event can arrive more than once, most
obviously when a retry races a slow 200 from your server.

Use the envelope `id` (`evt_…`) as the idempotency key. There is no per-delivery
id header, and no timestamp is signed, so `id` is also your only replay
protection: a replayed request carries a valid `Cko-Signature` — it is a byte
copy — and only deduplication stops it being processed twice.

Keep processed ids for at least **31 hours** to cover the automatic retry
window. That is a floor, not a ceiling: since the id is your only replay
protection, keeping ids longer (or permanently, keyed by `evt_…`) is safer.
Webhooks can also be resent manually from the Dashboard or API at any time;
whether a resend reuses the original `evt_…` id is not documented.

## Delivery and Retries

- **Acknowledge within 10 seconds.** *"Your webhook server must acknowledge
  every webhook it receives within 10 seconds."* Verify, enqueue, return 2xx.
- **Up to 8 retries**, each interval measured from the previous attempt:
  5 minutes → 10 minutes → 15 minutes → 30 minutes → 1 hour → 4 hours →
  12 hours → 12 hours. That's roughly 30 hours end to end.
- A non-2xx (or a timeout) triggers the next retry.

## Ordering Is Not Guaranteed

Checkout.com, verbatim from [Receive webhooks](https://www.checkout.com/docs/developer-resources/event-notifications/receive-webhooks):
*"Checkout.com guarantees to send webhooks at least once, but the order in
which we send them may vary."*

Practically: `payment_captured` can land **before** `payment_approved`. A
handler that refuses to capture an order it hasn't seen approved will drop real
money. Either:

- make each handler independently correct (upsert the payment state, don't
  require a predecessor), or
- compare the event against stored state and ignore transitions that would move
  the order backwards.

Do not drive a state machine off arrival order.

## No Handshake, No Challenge

Checkout.com does **not** send a verification/challenge request when you add an
endpoint, and there is no `ping` or `test` event type with a special envelope.
Every request your endpoint receives is an ordinary signed event. Don't write a
branch for a handshake.

## Source IPs

Checkout.com publishes the IPs it sends from
([IP addresses → Receive webhook notifications](https://www.checkout.com/docs/developer-resources/ip-addresses)),
but warns that *"the provided IP address lists are subject to change"* and that
*"you may experience access issues if you do not keep your allowlists
updated."* Rely on the HMAC, not an allowlist.
