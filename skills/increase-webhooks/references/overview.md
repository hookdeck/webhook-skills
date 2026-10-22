# Increase Webhooks Overview

## What Are Increase Webhooks?

Increase is a banking API. When something happens to an object (a Transaction posts, an ACH Transfer changes status, a card is authorized), Increase creates an **Event** and sends it as a `POST` to the URL of each matching **Event Subscription**. Subscriptions can be created in the live API or in the sandbox; sandbox subscriptions receive sandbox Events and vice versa.

Events are deliberately thin. To get the amount of a Transaction, `GET` it from the API using `associated_object_type` and `associated_object_id`.

## Common Event Types

The event name is the `category` field in the body. Categories are `<object>.created` or `<object>.updated` (about 120 in all, and Increase may add more).

| Category | Triggered When | Common Use Cases |
|----------|----------------|------------------|
| `transaction.created` | A settled Transaction is created | Ledger sync, balance notifications |
| `pending_transaction.created` | A hold is created | Show pending activity |
| `account.created` | An Account is created | Provision downstream records |
| `account.updated` | An Account changes (e.g. closed) | Keep account status in sync |
| `ach_transfer.created` | An ACH Transfer is created | Track outgoing payments |
| `ach_transfer.updated` | An ACH Transfer changes status | Detect submission, settlement, return |
| `inbound_ach_transfer.created` | An inbound ACH debit or credit arrives | Accept or decline inbound ACH |
| `wire_transfer.updated` | A Wire Transfer changes status | Track wires |
| `check_deposit.updated` | A Check Deposit changes status | Notify on deposit approval or rejection |
| `card_payment.created` | A Card Payment starts | Card spend notifications |
| `card_payment.updated` | A Card Payment gains an element (settlement, refund) | Reconcile card spend |
| `real_time_payments_transfer.updated` | A Real-Time Payments transfer changes status | Instant payment tracking |
| `entity.updated` | An Entity (KYC subject) changes | Onboarding status |

## Event Payload Structure

```json
{
  "id": "event_123abc",
  "created_at": "2020-01-31T23:59:59Z",
  "category": "transaction.created",
  "associated_object_type": "transaction",
  "associated_object_id": "transaction_abc123",
  "type": "event"
}
```

## Delivery and Retries

- A delivery succeeds only if your endpoint returns `2xx` within 10 seconds. Anything else (4xx, 5xx, connection error, timeout) is retried; Increase does not distinguish 4xx from 5xx.
- Production makes up to 8 attempts, measured from the Event: immediately, then about 1 minute, 10 minutes, 1 hour, 4 hours, 12 hours, 24 hours, and 72 hours later. Sandbox deliveries are not retried.
- Delivery can repeat, so deduplicate on `webhook-id` (the Event ID).
- Events stay available from the List Events API for 30 days; poll it to recover from an outage longer than the retry window.
- Webhooks are sent from `34.83.67.223`, `35.247.122.129`, and `34.168.16.194`.

## Full Event Reference

For the complete list of categories, see [Increase's Events API](https://increase.com/documentation/api/events) and the [webhooks guide](https://increase.com/documentation/webhooks).
