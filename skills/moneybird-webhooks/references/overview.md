# Moneybird Webhooks Overview

## What Are Moneybird Webhooks?

Moneybird is Dutch online accounting software. Instead of polling the API, you register a URL and Moneybird sends an HTTP `POST` with a JSON body when something changes in an administration (an invoice changes state, a contact is created, a payment is registered). Webhooks are created through the API (`POST /{administration_id}/webhooks.json`), not a dashboard form. Your URL must answer `200`, which Moneybird checks when you register it; any other status is retried 10 times with gradually longer intervals. You may put basic auth or a token in the URL as long as the URL stays valid.

## Common Event Types

These are values for `enabled_events` when you create the webhook, and they arrive as `action` in the body. A group name (for example `estimate`, `contact`, `sales_invoice`) subscribes to every event in the group.

| Event (`action`) | Triggered When | Common Use Cases |
|------------------|----------------|------------------|
| `sales_invoice_created` | A sales invoice is created | Sync new invoices to a CRM or ERP |
| `sales_invoice_state_changed_to_paid` | A sales invoice becomes paid | Release goods, update order status |
| `sales_invoice_state_changed_to_late` | A sales invoice becomes late | Dunning, account follow-up |
| `sales_invoice_send_email` | A sales invoice is sent by email | Audit trail |
| `contact_created` | A contact is created | Create the customer in another system |
| `contact_changed` | A contact is updated | Keep contact data in sync |
| `payment_registered` | A payment is registered | Reconciliation |
| `estimate_created` | A quote is created | Quote tracking |

Other families in the [events list](https://developer.moneybird.com/webhooks/events): `sales_invoice_state_changed_to_{draft,open,pending_payment,reminded,scheduled,uncollectible}`, `recurring_sales_invoice_*`, `external_sales_invoice_*`, `estimate_*`, `contact_*`, `document_*`, `purchase_transaction_*`, `product_*`, `project_*`, `subscription_*`, `financial_account_*`, `ledger_account_*` and `tax_rate_*`.

If `enabled_events` is empty, Moneybird uses the old behaviour: notifications after sales invoice state changes only.

## Event Payload Structure

```json
{
  "administration_id": "116015326147118082",
  "webhook_id": "116010948233266179",
  "webhook_token": "hPCNhskk1PwGC1pyJZMZmKNT",
  "entity_type": "SalesInvoice",
  "entity_id": "116015245643744263",
  "state": "late",
  "action": "sales_invoice_state_changed_to_late",
  "entity": { "id": "116015245643744263", "contact_id": "116015245567198212", "state": "late", "currency": "EUR", "details": [] }
}
```

- `action`: the event name. Dispatch on this.
- `entity_type` / `entity_id`: what changed (for example `SalesInvoice`).
- `state`: the new state that triggered the push. `entity.state` is the current state when the push was built, so the two can differ if the record changed in between.
- `entity`: the same JSON you would get from the API for that record.

Each push also has an `Idempotency-Key` header, unique per push and repeated on retries.

## Full Event Reference

For the complete list of events, see [Moneybird's webhook events](https://developer.moneybird.com/webhooks/events) and [payload](https://developer.moneybird.com/webhooks/payload) documentation.
