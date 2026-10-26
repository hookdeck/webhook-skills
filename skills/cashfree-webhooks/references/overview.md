# Cashfree Webhooks Overview

## What Are Cashfree Webhooks?

[Cashfree Payments](https://www.cashfree.com) is an Indian payments company. One signing scheme covers four of its webhook products:

| Product | What it reports |
|---------|-----------------|
| Payment Gateway | Payments, refunds, settlements, subscriptions, payment links, token vault, disputes |
| Payouts V2 | Transfer status (success, failure, reversal) |
| Secure ID | Video KYC, bank account verification, reverse penny drop |
| PPI | Prepaid wallet events |

Legacy **Payouts V1 / Cashgram** webhooks are form-encoded POST parameters with a different scheme and are not covered here. They fail the verification below.

Delivery is `POST` to your HTTPS endpoint. Cashfree treats anything other than **HTTP 200** (3xx included) as a failure.

## Common Event Types

The event name is in `type` for Payment Gateway and Payouts V2 bodies, and in `event_type` for Secure ID and PPI bodies. Read `type` and fall back to `event_type`.

| Event | Product | Triggered when |
|-------|---------|----------------|
| `PAYMENT_SUCCESS_WEBHOOK` | Payment Gateway | A payment succeeds |
| `PAYMENT_FAILED_WEBHOOK` | Payment Gateway | A payment fails |
| `PAYMENT_USER_DROPPED_WEBHOOK` | Payment Gateway | The customer abandons the payment |
| `REFUND_STATUS_WEBHOOK` | Payment Gateway | A refund changes status |
| `SETTLEMENT_STATUS_WEBHOOK` | Payment Gateway | A settlement changes status |
| `TRANSFER_SUCCESS` | Payouts V2 | A transfer reaches the beneficiary |
| `TRANSFER_FAILED` | Payouts V2 | A transfer fails |
| `TRANSFER_REVERSED` | Payouts V2 | A transfer is reversed |
| `BANK_ACCOUNT_VERIFICATION_SUCCESS` | Secure ID | A bank account verification succeeds (other `BANK_ACCOUNT_VERIFICATION_*` events exist) |
| `VKYC_AUDITOR_REVIEW_COMPLETED` | Secure ID | A Video KYC auditor review completes (other `VKYC_*` events exist) |
| `PPI_CREDIT_SUCCESS` | PPI | A wallet credit succeeds |

The Payment Gateway webhook pages use the `*_WEBHOOK` names. The overview page's sample payloads abbreviate some of them (for example `"type": "PAYMENT_SUCCESS"`), so the example handlers accept both spellings.

## Event Payload Structure

Payment Gateway and Payouts V2:

```json
{
  "data": { "order": { "order_id": "order_1234", "order_amount": 500.0 },
            "payment": { "cf_payment_id": 9876543210, "payment_status": "SUCCESS" } },
  "event_time": "2024-01-15T10:30:05+05:30",
  "type": "PAYMENT_SUCCESS"
}
```

Secure ID and PPI:

```json
{
  "event_type": "PPI_CREDIT_SUCCESS",
  "event_time": "2006-01-02T15:04:05Z",
  "data": { "credit_id": "CREDIT126345", "wallet_id": "WALLET936721", "amount": 100.5, "status": "SUCCESS" }
}
```

Secure ID bodies may also carry `version`. Payloads have no single event ID, so dedupe on business IDs (`cf_payment_id`, `transfer_id`, `reference_id`, `credit_id`).

## Delivery and Retries

- At-least-once delivery; order is not guaranteed.
- **Payment Gateway:** per-endpoint retry policy. Default is 3 retries at 2, 10 and 30 minutes; Fixed, Exponential or Custom policies allow up to 10. The dashboard offers Batch Resend.
- **Payouts V2:** fixed schedule; the endpoint is disabled after 5 consecutive failures.
- **Secure ID and PPI:** retried, schedule not stated.
- Return `200` quickly after verification and process asynchronously.

## Full Event Reference

See [Cashfree's webhook documentation](https://www.cashfree.com/docs/api-reference/webhooks/overview) and [payloads and signature verification](https://www.cashfree.com/docs/api-reference/webhooks/payloads-and-signatures).
