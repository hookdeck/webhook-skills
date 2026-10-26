# Invoice Ninja Webhooks Overview

## What Are Invoice Ninja Webhooks?

A webhook is a subscription: one **event** mapped to one **target URL**, with an optional HTTP
method and custom headers. When the event happens, Invoice Ninja queues a job that sends the
affected entity to the URL. Webhooks are not signed; you authenticate them with a secret header
you add to the subscription (see [verification.md](verification.md)).

## Delivery Behavior

Taken from Invoice Ninja's `WebhookSingle` job:

| Response / outcome | What Invoice Ninja does |
|--------------------|-------------------------|
| 2xx | Success, logged |
| Connection error | Retried with backoff (up to 5 tries) |
| `429` | Retried with backoff |
| `404`, `405`, `410` | **Deletes the webhook subscription** |
| Other 4xx (including `401`, `400`) | Logged as a failure, not retried |
| 5xx | Logged as a failure, not retried |

Requests carry `Accept: application/json`, a `User-Agent` starting `InvoiceNinja/`, and your
custom headers. The method is the subscription's `rest_method`, which the server validates as
`post` (the default) or `put`, and the entity is always sent as a JSON body.

## Event Payload Structure

The body is the entity as produced by its transformer, with no envelope and **no event field**:

```json
{
  "id": "Opnel5aKBz",
  "client_id": "Wpmbk5ezJn",
  "number": "0001",
  "amount": 100,
  "balance": 100,
  "line_items": [{ "product_key": "design", "cost": 100, "quantity": 1 }]
}
```

Because the event isn't in the body, route by URL (one subscription per event, with
`?event=create_invoice` on the target URL) or by entity shape: `line_items` is a document
(invoice, quote, credit or purchase order), `applied` / `transaction_reference` a payment,
`contacts` a client.

## Common Event Types

| Event key | Triggered When |
|-----------|----------------|
| `create_invoice` | An invoice is created |
| `create_payment` | A payment is created |
| `update_client` | A client is updated |

## Full Event Key List

Each key is `<action>_<entity>`. Exact keys from Invoice Ninja's `Webhook` model:

- **Client:** `create_client`, `update_client`, `archive_client`, `restore_client`, `delete_client`
- **Invoice:** `create_invoice`, `sent_invoice`, `update_invoice`, `late_invoice`, `remind_invoice`, `archive_invoice`, `restore_invoice`, `delete_invoice`
- **Quote:** `create_quote`, `sent_quote`, `update_quote`, `approve_quote`, `expired_quote`, `archive_quote`, `restore_quote`, `delete_quote`, `remind_quote`
- **Credit:** `create_credit`, `sent_credit`, `update_credit`, `archive_credit`, `restore_credit`, `delete_credit`
- **Payment:** `create_payment`, `update_payment`, `archive_payment`, `restore_payment`, `delete_payment`
- **Vendor:** `create_vendor`, `update_vendor`, `archive_vendor`, `restore_vendor`, `delete_vendor`
- **Expense:** `create_expense`, `update_expense`, `archive_expense`, `restore_expense`, `delete_expense`
- **Task:** `create_task`, `update_task`, `archive_task`, `restore_task`, `delete_task`
- **Project:** `create_project`, `update_project`, `archive_project`, `restore_project`, `delete_project`
- **Product:** `create_product`, `update_product`, `delete_product`, `restore_product`, `archive_product`
- **Purchase order:** `create_purchase_order`, `sent_purchase_order`, `update_purchase_order`, `delete_purchase_order`, `restore_purchase_order`, `archive_purchase_order`, `accept_purchase_order`

## Full Event Reference

See Invoice Ninja's [webhook API documentation](https://api-docs.invoicing.co/#tag/webhooks) and the
[`WebhookSingle`](https://github.com/invoiceninja/invoiceninja/blob/v5-stable/app/Jobs/Util/WebhookSingle.php)
job.
