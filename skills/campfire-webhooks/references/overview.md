# Campfire Webhooks Overview

## What Are Campfire Webhooks?

[Campfire](https://campfire.ai) (app.meetcampfire.com) is an AI accounting and ERP platform. Campfire webhooks notify your systems when data changes: an invoice is paid, a bill is created, a journal entry is updated. You register an HTTPS endpoint, subscribe it to topics, and Campfire sends a signed `POST` with a JSON body for every matching event.

> Not 37signals' Campfire team-chat product. Different company, different webhooks.

Managing webhooks (in the app or via the API) requires an **admin** user; non-admin API keys get a `403` from the webhook endpoints.

## What Topics Does Campfire Send?

The event name is the body's `topic` field. Topic names are exact, case-sensitive strings (28 documented):

| Object | Topics |
|--------|--------|
| Invoices | `Invoice.created`, `Invoice.updated`, `Invoice.deleted`, `Invoice.payment`, `Invoice.paid` |
| Bills | `Bill.created`, `Bill.updated`, `Bill.deleted`, `Bill.payment`, `Bill.paid` |
| Credit memos | `CreditMemo.created`, `CreditMemo.updated`, `CreditMemo.deleted` |
| Credit memo lines | `CreditMemoLine.created`, `CreditMemoLine.updated`, `CreditMemoLine.deleted` |
| Debit memos | `DebitMemo.created`, `DebitMemo.updated`, `DebitMemo.deleted` |
| Debit memo lines | `DebitMemoLine.created`, `DebitMemoLine.updated`, `DebitMemoLine.deleted` |
| Journal entries | `JournalEntry.created`, `JournalEntry.updated`, `JournalEntry.deleted` |
| Contracts | `Contract.created`, `Contract.updated`, `Contract.deleted` |

### Payment topics

- `Invoice.payment` / `Bill.payment` fire whenever the amount paid **increases**, including partial payments.
- `Invoice.paid` / `Bill.paid` fire when the document becomes **fully paid**. Then **both** `.paid` and `.payment` fire (two separate deliveries) and **no** `.updated` event is sent for that change.

## Event Payload Structure

Every delivery is a `POST` with `Content-Type: application/json` and four body fields:

| Field | Description |
|-------|-------------|
| `webhook_uuid` | UUID of the webhook subscription (matches the `Campfire-Webhook-UUID` header) |
| `topic` | The topic that fired, e.g. `Invoice.paid` |
| `data` | The full serialized object, same shape as the matching GET endpoint in the API. For `*.deleted` it is only `{"id": 12345}` |
| `changes` | Field-level diff keyed by field name with `old` and `new`. `null` for `*.deleted`. On `*.created`, every field is listed with `"old": null` |

```json
{
  "webhook_uuid": "3c88df19-1c1f-4b1c-b4a7-768793055a60",
  "topic": "Invoice.paid",
  "data": { "id": 12345, "invoice_number": "INV-1042", "payment_status": "paid", "amount_paid": 1500.0 },
  "changes": {
    "payment_status": { "old": "open", "new": "paid" },
    "amount_paid": { "old": 500.0, "new": 1500.0 }
  }
}
```

## Request Headers

| Header | Description |
|--------|-------------|
| `Content-Type` | Always `application/json` |
| `Campfire-Webhook-Request-Timestamp` | Unix timestamp (seconds) of when the request was signed |
| `Campfire-Webhook-Signature-v1` | Hex-encoded HMAC-SHA256 signature |
| `Campfire-Webhook-UUID` | UUID of the webhook subscription, constant across deliveries |

## Delivery and Retries

- Respond `2xx` to acknowledge. Any `4xx` or `5xx` is a failure.
- Failed deliveries are retried up to **5 times**, about one minute apart. A **404 is not retried**.
- Each retry is **re-signed** with a fresh timestamp and signature.
- Not delivered in order, and duplicates are possible: make the handler idempotent, and treat `data` as the latest state of the object instead of applying `changes` incrementally.
- Acknowledge first and process slow work asynchronously.
- Recent deliveries (25) are visible under **Recent Events** on the Webhooks settings page and via `GET /integrations/api/v1/webhook/{id}/events`, with status `PENDING`, `SUCCESS` or `FAILURE` and the full request and response.

## Full Event Reference

See [Campfire's webhook documentation](https://docs.campfire.ai/guides/webhooks).
