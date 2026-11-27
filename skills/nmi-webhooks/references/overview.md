# NMI Webhooks Overview

## What Are NMI Webhooks?

NMI (Network Merchants) is a payment gateway. Its webhooks notify your
application when gateway activity happens (a sale is approved, an
authorization is captured, an electronic check is returned, a subscription is
created, a settlement batch completes) so you don't have to poll the Query API.

NMI webhooks are unusual in two ways worth internalising up front:

1. **They are not [Standard Webhooks](https://www.standardwebhooks.com/).** The
   single `Webhook-Signature` header has the form `t=<nonce>,s=<signature>`.
2. **NMI's sample calls `t` a nonce.** It is folded into the signed content.
   The docs don't say what it holds or whether it is a timestamp, and they
   document no replay/timestamp tolerance, so do not reject deliveries by age.

These are the Payment Gateway's webhooks, set up in the Merchant Portal. NMI's
Merchant Sign-Up API sends separate `application.*` and `merchant.*` events,
signed in a `Signature` header with a different scheme; this skill doesn't
cover them.

## Event Payload Structure

Every delivery has the same envelope. This is NMI's own example for
`settlement.batch.failure`:

```json
{
  "event_id": "dfe8156d-5dd9-43ac-8928-3cf70ef74108",
  "event_type": "settlement.batch.failure",
  "event_body": {
    "batch_id": "123456",
    "merchant": {
      "id": "123456",
      "name": "Test Merchant"
    },
    "processor": {
      "id": "ccprocessor",
      "name": "CC Processor",
      "type": "cc"
    }
  }
}
```

| Field | Meaning |
|-------|---------|
| `event_id` | NMI: "A unique identifier for this event." |
| `event_type` | The event name, such as `transaction.sale.success` |
| `event_body` | Event-specific data; its shape depends on the event type |

A transaction event's `event_body` holds the whole transaction record:
`transaction_id`, `transaction_type`, `condition`, the billing and shipping
addresses, the `card` or `check`, and an `action` object with `action_type`,
`amount`, `date`, `success` and `response_code`. Settlement, chargeback and
Automatic Card Updater events summarise a batch instead.

## Event Types

NMI lists 36 Payment Gateway events in six categories.

### Transactions: `transaction.<action>.<result>`

- **action**: one of `sale`, `auth`, `capture`, `void`, `refund`, `credit`, `validate`
- **result**: one of `success`, `failure`, `unknown`

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `transaction.sale.success` | A sale (auth + capture in one step) succeeds | Fulfil order, send receipt |
| `transaction.sale.failure` | A sale fails | Notify customer, start dunning |
| `transaction.sale.unknown` | A sale's status is unknown | Look the transaction up before acting |
| `transaction.auth.success` | An authorization succeeds | Hold order, await capture |
| `transaction.auth.failure` | An authorization fails | Notify customer |
| `transaction.capture.success` | A capture succeeds | Mark order paid, fulfil |
| `transaction.void.success` | A void succeeds | Release hold, cancel order |
| `transaction.refund.success` | A refund succeeds | Reverse fulfilment, notify customer |
| `transaction.credit.success` | A credit transaction succeeds | Payout/adjustment bookkeeping |
| `transaction.validate.success` | A validation transaction succeeds | Save card on file |

The `.failure` and `.unknown` variants exist for every action. Treat `.unknown`
as unresolved and query the transaction before fulfilling or charging again.

### Other categories

| Category | Events |
|----------|--------|
| Check status | `transaction.check.status.settle`, `transaction.check.status.return`, `transaction.check.status.latereturn` |
| Recurring | `recurring.plan.add`, `recurring.plan.update`, `recurring.plan.delete`, `recurring.subscription.add`, `recurring.subscription.update`, `recurring.subscription.delete` |
| Settlement | `settlement.batch.complete`, `settlement.batch.failure` |
| Chargebacks | `chargeback.batch.complete` (only if your processor supports chargeback reporting) |
| Automatic Card Updater | `acu.summary.automaticallyupdated`, `acu.summary.contactcustomer`, `acu.summary.closedaccount` |

## Delivery Behaviour

- **Retries.** If NMI doesn't get an HTTP 200, it retries up to 20 times over
  about 3 days, then drops the notification. NMI says the schedule may change,
  and may be cut for an endpoint with a large backlog. Respond `200` (not 201,
  202 or 204) quickly and do slow work asynchronously.
- **Idempotency.** Because of retries, the same event can arrive more than once.
  NMI's own examples print the same `event_id` on different event types, so
  deduplicate on `event_type` plus `event_id`, and keep handlers idempotent.
- **Ordering.** Not documented. Compare a transaction's `action.date` with what
  you've stored before applying an event.
- **Endpoints.** URLs must use `https` with valid TLS. Events start as soon as
  the URL is saved.
- **Source IPs.** Deliveries originate from NMI's published ranges
  (`104.192.32.81–104.192.32.87` and `104.192.36.81–104.192.36.87`). An IP
  allowlist can be a defence-in-depth layer, but the `Webhook-Signature` HMAC is
  the authoritative check.

## Full Event Reference

- [NMI Webhooks documentation](https://docs.nmi.com/reference/overview)
- [Retry Logic](https://docs.nmi.com/reference/retry-logic)
