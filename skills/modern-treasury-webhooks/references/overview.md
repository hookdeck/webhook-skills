# Modern Treasury Webhooks Overview

## What Are Modern Treasury Webhooks?

Many Modern Treasury integrations are asynchronous (file-based messaging with banks, batching), so the API reports progress by sending HTTP `POST` webhooks with a JSON body. Endpoints are configured per organization in Developer settings; separate URLs may be used for live and test traffic. Delivery is HTTPS only (TLS 1.2+), the endpoint has 5 seconds to return a 2xx, and failed deliveries retry with exponential backoff for up to 15 attempts (about a day and a half) before the endpoint is paused.

## Request Headers

| Header | Meaning |
|--------|---------|
| `X-Signature` | Hex HMAC-SHA256 of the raw body, keyed with the webhook key |
| `X-Topic` | Category of the object, e.g. `payment_order` |
| `X-Webhook-ID` | Unique per webhook; persists across retries (idempotency key) |
| `X-Event-ID` | ID of the Event object; same across retries |
| `X-Delivery-ID` | Unique per delivery attempt |
| `X-Event-Time` | Event time with nanosecond precision |
| `X-Live-Mode` | `true` for live, `false` for test |
| `X-Organization-ID` | Your organization ID |
| `X-Internal-Signature` | Internal failsafe; ignore it |

## Payload Structure

```json
{
  "event": "completed",
  "data": { "id": "0198860a-...", "object": "payment_order", "status": "completed" }
}
```

`event` is the bare event name and `data` is the serialized object that changed. The topic is **not** in the body; read it from `X-Topic`.

## Topics

`balance_report`, `case`, `connection_legal_entity`, `decision`, `external_account`, `expected_payment`, `incoming_payment_detail`, `internal_account`, `ledger_account_settlement`, `ledger_transaction`, `legal_entity`, `payment_order`, `return`, `reversal`, `transaction`, `user_onboarding`.

## Common Event Types

| Topic.Event | Triggered When | Common Use Cases |
|-------------|----------------|------------------|
| `payment_order.created` | A payment order is created (async create endpoint) | Track submissions |
| `payment_order.approved` / `denied` | Approval decision made | Notify approvers |
| `payment_order.completed` | Bank accepted and executed the payment | Mark payment sent |
| `payment_order.reconciled` | Matched to a posted bank transaction | Treat as fully settled |
| `payment_order.failed` | Async creation failed, or bank/network rejected it | Alert, redraft |
| `payment_order.returned` | Payment was returned | Reverse application state, redraft |
| `expected_payment.reconciled` | Expected payment matched to a posted transaction | Credit a customer |
| `expected_payment.overdue` | Expected payment passed its window | Chase payer |
| `incoming_payment_detail.completed` | Incoming funds posted to your account | Credit a customer |
| `transaction.created` / `reconciled` | Bank transaction appears / is reconciled | Ledger sync |
| `return.created` / `completed` | A return is created / posted | Handle refunds |

### Payment order events

`created`, `updated`, `failed`, `approved`, `denied`, `cancelled`, `begin_processing`, `finish_processing`, `acknowledged`, `confirmed`, `tentatively_reconciled`, `completed`, `returned`, `reconciled`, `receiving_account_reconciled`, `redrafted`, `reversed`, `nsf_deferment`, `nsf_plaid_error_but_processing`, `unreconciled`, `held`, `resolved`.

Not every event changes the payment order `status` (`acknowledged`, `confirmed`, `tentatively_reconciled`, `reconciled` and `receiving_account_reconciled` do not). `acknowledged` and `confirmed` are only available at some banking partners and payment types.

### Expected payment events

`created`, `reconciled`, `partially_reconciled`, `tentatively_reconciled`, `unreconciled`, `overdue`, `archived`.

### Incoming payment detail events

`created`, `tentatively_reconciled`, `completed`, `reconciled`, `returned`, `failed`, `return_failed`, `unreconciled`.

### Transaction events

`created`, `reconciled`, `updated`.

### Return events

`created`, `begin_processing`, `finish_processing`, `tentatively_reconciled`, `reconciled`, `completed`, `returned`, `failed`, `unreconciled`.

### Reversal events

`created`, `begin_processing`, `finish_processing`, `completed`, `failed`, `returned`, `unreconciled`.

## Full Event Reference

Each topic has its own page listing events. Start from [Modern Treasury's webhook documentation](https://docs.moderntreasury.com/platform/reference/webhooks) (for example [Payment Order Webhooks](https://docs.moderntreasury.com/platform/reference/payment-orders) and [Expected Payment Webhooks](https://docs.moderntreasury.com/platform/reference/expected-payments)).
