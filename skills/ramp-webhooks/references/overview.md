# Ramp Webhooks Overview

## What Are Ramp Webhooks?

Ramp pushes real-time notifications about your Ramp account (card transactions, bills, reimbursements, purchase orders, vendors, and more) to an HTTPS endpoint you register with `POST /developer/v1/webhooks`. Payloads are thin: they identify the resource, and you fetch the details from the Ramp API (for example `GET /developer/v1/transactions/{transaction_id}`).

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `webhooks.verification` | A subscription is created (one-time challenge) | Activate the subscription |
| `transactions.authorized` | A card transaction is authorized | Pending spend tracking |
| `transactions.cleared` | A transaction settles (also refunds and reversals) | Reconciliation, ledger entries |
| `transactions.declined` | A card transaction is declined | Alerting |
| `reimbursements.ready_for_review` | A reimbursement needs review | Approval routing |
| `bills.created` | A bill is created | Accounting sync |
| `bills.approved` | A bill is approved | Schedule payment |
| `bills.paid` | A bill payment completes | Mark paid |
| `tests.test_event` | Mock event from the mock-webhook-event endpoint | Testing |

## Other Events

Applications: `applications.status_updated`. Bills: `bills.archived`, `bills.ready_to_sync`, `bills.rejected`, `bills.updated`. Entities: `entities.created`. Item receipts: `item_receipts.created`. Purchase orders: `purchase_orders.archived`, `purchase_orders.created`, `purchase_orders.updated`. Reimbursements: `reimbursements.batch_payment_reimbursed`, `reimbursements.ready_to_sync`, `reimbursements.sync_requested`. Spend requests: `spend_requests.comment_created`, `spend_requests.created`. Transactions: `transactions.all_requirements_met_and_approved_changed`, `transactions.body_coding_updated`, `transactions.ready_for_review`, `transactions.ready_to_sync`, `transactions.receipt_added`, `transactions.sync_requested`, `transactions.synced`. Unified requests: `unified_requests.created`, `.external_approval_request`, `.external_approval_request_reset`, `.modified`, `.node_advanced`, `.override_approved`, `.updated`. Users: `users.invite_accepted`. Vendor agreements: `vendor_agreements.archived`, `.created`, `.deleted`, `.document_added`, `.renewal_milestone`, `.updated`. Vendors: `vendors.activated`, `vendors.approved`, `vendors.updated`.

## Event Payload Structure

```json
{
  "id": "evt_0b1c2d3e",
  "type": "transactions.cleared",
  "created_at": "2026-10-21T10:15:00Z",
  "business_id": "biz_123",
  "object": { "id": "a1b2c3d4-0000-0000-0000-000000000001" }
}
```

- `id`: unique event ID, constant across retries (also sent in the `X-Ramp-Webhook-ID` header)
- `type`: event type
- `created_at`: ISO 8601 timestamp
- `business_id`: which business the event belongs to (useful for multi-customer apps)
- `object`: affected resource ID plus any event-specific metadata

`transactions.cleared` does not include the amount. Fetch the transaction and read `entity_amount.value` (signed; negative for refunds or credits) when `entity_amount` is not null.

## Delivery and Retries

- Respond with 2xx within 10 seconds.
- 3xx and 4xx (except 429) fail immediately with no retries.
- 429, 5xx, timeouts and connection errors are retried up to 10 total attempts, with exponential backoff and full jitter (up to 60 seconds between attempts).
- Events can arrive out of order (`transactions.cleared` before `transactions.authorized`); fetch the latest resource state when order matters.

## Full Event Reference

See [Ramp's webhook documentation](https://docs.ramp.com/developer-api/v1/guides/webhooks).
