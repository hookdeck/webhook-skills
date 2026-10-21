# Bolt Webhooks Overview

## What Are Bolt Webhooks?

Bolt (boltapp.com, the checkout and payments platform) sends HTTP `POST` requests to your server when transaction lifecycle events happen: a payment passes fraud review, a capture or refund completes, a transaction is voided, and so on. Webhooks are asynchronous notifications ("Bolt informs, nothing waits"), distinct from **Merchant Callbacks**, which Bolt calls synchronously during checkout and which are configured separately.

Transaction webhooks are triggered by Bolt's authorize, capture, refund, and void endpoints (some accept `skip_hook_notification` to suppress the notification). Virtual Terminal transactions do not send webhooks.

## Common Event Types

The event type is the top-level `type` string in the JSON body.

| Event | Triggered When | Transaction status |
|-------|----------------|--------------------|
| `pending` | Pre-authorization succeeded, transaction is pending fraud review | Pending |
| `failed_payment` | Payment failed pre-authorization | Failed Authorization |
| `payment` | Automatic capture: passed authorization and fraud review, funds captured | Completed |
| `auth` | Manual capture: passed authorization and fraud review, ready to capture | Authorized |
| `rejected_irreversible` | Failed fraud review, cannot be appealed | Permanently Rejected |
| `rejected_reversible` | Flagged in fraud review, re-review can be requested | Recently Rejected |
| `capture` | A manual capture succeeded | Completed |
| `credit` | A refund or credit was processed | Refunded |
| `void` | The transaction was voided | Cancelled |
| `newsletter_subscription` | Customer subscribed to the merchant's newsletter | n/a |
| `risk_insights` | Risk information from the fraud review is available | n/a |
| `credit_card_deleted` | Customer removed a saved card (beta, custom cart only) | n/a |

The webhook contract also lists shopper subscription events: `subscription_created`, `subscription_renewed`, `subscription_canceled`, `subscription_payment_failed`, `subscription_paused`, `subscription_unpaused`, `subscription_ended`. An endpoint subscribed to all events should return 200 for types it doesn't handle.

For `auth` webhooks, a notification is only triggered if the authorization included a risk review.

## Event Payload Structure

Transaction events share this envelope:

```json
{
  "type": "payment",
  "object": "transaction",
  "data": {
    "id": "T1c3p4yBuVYJ9",
    "type": "cc_payment",
    "processor": "stripe",
    "date": 1615407159447,
    "reference": "LBLJ-TWW7-R9VC",
    "status": "completed",
    "amount": { "amount": 10000, "currency": "USD", "currency_symbol": "$" }
  }
}
```

Other `data` fields include `from_user`, `from_credit_card`, `order`, `authorization`, `captures`, `refund_transactions`, `risk_signals`, and `capture_type`. Amounts are in minor units (cents). `data.status` is one of `authorized`, `cancelled`, `completed`, `created`, `failed`, `in_progress`, `pending`, `rejected_irreversible`, `rejected_reversible`. `credit_card_deleted` has `object: "credit_card"` and `data.user` / `data.credit_card`.

(The example above is abbreviated from Bolt's schema; see the reference for the full set of fields per event.)

## Delivery and Retries

Respond with HTTP `200 OK` and a valid JSON body. Otherwise Bolt retries with exponential back-off. After 10 failed attempts Bolt sends a failure email (if enabled). The payload has no event ID, so make processing idempotent.

## Full Event Reference

- [Bolt webhook events](https://help.boltapp.com/api-reference/guides/webhooks/)
- [Transaction Webhooks API reference](https://help.boltapp.com/api-reference/merchant-callback-reference/webhooks/transactionwebhooks)
- [Webhook Setup](https://help.boltapp.com/developers/webhooks/)
