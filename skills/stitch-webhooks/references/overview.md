# Stitch Webhooks Overview

## What Are Stitch Webhooks?

Stitch (stitch.money) is a South African payments platform (Pay by Bank,
Capitec Pay, Card, DebiCheck, Manual EFT, Cash, Refunds, Disbursements). It
sends a webhook whenever the core status of a payment or transaction changes.

Webhooks are delivered by **Svix** from Stitch's EU-region Svix account. You
subscribe per client ID, choosing the endpoint URL and the event types
(`filterTypes`) to receive. Each subscription has its own signing secret.

> Stitch also has **legacy webhooks** (the older, non-Svix mechanism). They use a
> different payload structure and verification. This skill covers the current
> Svix-based webhooks. Legacy subscribers can move over with the
> `clientSubscriptionMigrate` mutation (see [setup.md](setup.md)).

## What Event Types Does Stitch Send?

| Event type | Product | Statuses that trigger it |
|------------|---------|--------------------------|
| `payment` | Pay by Bank, Capitec Pay, Card (once-off), Manual EFT, Cash | `PaymentInitiationRequestCompleted`, `PaymentInitiationRequestCancelled`, `PaymentInitiationRequestExpired` |
| `payment.confirmation` | Same products, when a Stitch intermediary account is used | `PaymentReceived`, `PaymentUnsettled` |
| `payment-consent-request` | Card, Capitec Pay Recurring, DebiCheck (tokenized pay-ins) | `PaymentConsentProcessing`, `PaymentConsentFailed`, `PaymentConsentGranted`, `PaymentConsentCancelled`, `PaymentConsentExpired`, `PaymentConsentRevoked`, `PaymentConsentPaused` |
| `transaction` | Card, Capitec Pay Recurring, DebiCheck | payload `status`: `SUCCESS`, `FAILURE`, `CANCELLED` (and `PENDING` for pre-authorized card transactions awaiting capture) |
| `collection` | Batch collections (subscriptions) | `PaymentCollectionCompleted`, `PaymentCollectionFailed`, `PaymentCollectionCancelled` (payload `data.status`: `completed`, `failed`, `cancelled`) |
| `refund` | Refunds (Pay by Bank, Card, Wallet) | `RefundSubmitted`, `RefundCompleted`, `RefundError`, `RefundPaused` |
| `disbursement` | Disbursements | `DisbursementSubmitted`, `DisbursementCompleted`, `DisbursementError`, `DisbursementPaused`, `DisbursementCancelled`, `DisbursementReversed` |

Deprecated types: `direct-deposit`, `payment-initiation` (LinkPay), and
`payment-initiation.confirmation` (LinkPay).

## What Do Stitch Webhook Payloads Look Like?

There are **two payload shapes**, and only one of them carries the event type.

### Envelope shape (`payment-consent-request`, `transaction`, `collection`)

```json
{
  "id": "transaction:status:success:40431E69-3DF7-4B2A-B464-DE540474BC1C",
  "type": "transaction",
  "datetime": "2023-05-10T12:22:42.865Z",
  "data": {
    "id": "Y2FyZHRyYW5zYWN0aW9uLzQw...",
    "status": "SUCCESS",
    "type": "CARD",
    "amount": { "currency": "ZAR", "quantity": "1" },
    "externalReference": "79261d16-c53b-48eb-9019-dc9cfb6c5126"
  }
}
```

The top-level `id` identifies the specific status transition
(`<type>:status:<status>:<resource id>`) and is a good idempotency key.

### GraphQL shape (`payment`, `payment.confirmation`, `refund`, `disbursement`)

```json
{
  "data": {
    "client": {
      "paymentInitiationRequests": {
        "node": {
          "__typename": "PaymentInitiationRequest",
          "id": "cGF5cmVxLzk2YjUy...",
          "externalReference": "79261d16-c53b-48eb-9019-dc9cfb6c5126",
          "state": { "__typename": "PaymentInitiationRequestCompleted" },
          "paymentConfirmation": { "__typename": "PaymentPending" }
        }
      }
    }
  }
}
```

There is no `type` field here. Identify the event by the key under
`data.client`:

| `data.client` key | Event type(s) | Status field on `node` |
|-------------------|---------------|------------------------|
| `paymentInitiationRequests` | `payment` or `payment.confirmation` | `state.__typename`, `paymentConfirmation.__typename` |
| `refunds` | `refund` | `status.__typename` |
| `disbursements` | `disbursement` | `status.__typename` |

`payment` and `payment.confirmation` have the same shape. If you need to treat
them differently, check `paymentConfirmation.__typename` (`PaymentReceived` /
`PaymentUnsettled` on confirmations). Both should update the payment
idempotently from the node's current state.

## Full Event Reference

- [Stitch Event Types](https://docs.stitch.money/webhooks/types), with full example payloads
- [Using Webhooks](https://docs.stitch.money/webhooks/using_webhooks)
- The Svix portal's **Event Catalog** shows each type's schema
