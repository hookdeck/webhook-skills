# Rutter Webhooks Overview

## What Are Rutter Webhooks?

Rutter is a unified API for commerce and accounting platforms (Shopify, QuickBooks, Xero, NetSuite and more). Rutter sends a webhook to your endpoint whenever a Connection changes state or the underlying data changes. Rutter offers webhooks for every platform, including ones with no native webhooks: each incremental sync computes the changes and fires the matching webhooks. Real-time webhooks (fired as soon as the platform reports a change) are available for QuickBooks Online, Xero, Stripe and Sage Intacct.

Set a single webhook URL per environment on the Platforms page of the Rutter dashboard.

## Common Event Types

Every payload has `type` and `code`. The examples in this skill route on `code`.

| `type` | `code` | Triggered When | Common Use Cases |
|--------|--------|----------------|------------------|
| `CONNECTION` | `INITIAL_UPDATE` | Initial data download for a Connection is done | Start fetching merchant data (earlier fetches return `PRODUCT_NOT_READY`) |
| `CONNECTION` | `CONNECTION_NEEDS_UPDATE` | Merchant unauthorized/uninstalled, or auth failed | Send the merchant `update_url` to re-authenticate |
| `CONNECTION` | `CONNECTION_DISABLED` | Rutter disabled access (e.g. suspended store) | Alert the merchant, check connection status |
| `ORDER` | `ORDER_CREATED` | New order for a connection | Sync order, trigger fulfillment |
| `ORDER` | `ORDER_UPDATED` | Any order field changed (line items, status, payment status) | Update stored order |
| `ORDER` | `ORDER_DELETED` | Order deleted (payload carries only `order.id`) | Remove stored order |
| `INVOICE` | `INVOICE_CREATED` | New accounting invoice | Reconcile, notify |
| `INVOICE` | `INVOICE_UPDATED` | Invoice changed | Update ledger sync |

Other codes documented by Rutter:

- Connection: `HISTORICAL_UPDATE` (only with data batching), `INCREMENTAL_SYNC_COMPLETED` (manual syncs from the dashboard only), `CONNECTION_UPDATED`, `CONNECTION_LINK_ERROR`, `CONNECTION_ERROR`, `CONNECTION_AUTHENTICATED` (Intuit Bank Feeds)
- Accounting: `ACCOUNT_*`, `BILL_*`, `BILL_PAYMENT_*`, `CUSTOMER_*`, `INVOICE_CREDIT_MEMO_*`, `JOURNAL_ENTRY_*`, `VENDOR_*` (`_CREATED` / `_UPDATED`, plus `_DELETED` on supported platforms)
- Commerce: `PRODUCT_CREATED`, `PRODUCT_UPDATED`, `PRODUCT_DELETED`, `PRODUCT_READY`, `PRODUCT_FINISH_FAILED`, `STORE_UPDATED`
- Entity webhooks may include `job_id` when the change came from your own Rutter API write; it matches the `JOB_COMPLETED` webhook for that write

The list is not exhaustive; the Rutter dashboard shows the full set.

## Event Payload Structure

```json
{
  "type": "ORDER",
  "code": "ORDER_CREATED",
  "access_token": "313c3e00-2bbc-4b2e-a9dc-13abed546b65",
  "connection_id": "222c3e00-2bbc-4b2e-a9dc-13abed546b65",
  "order": { "...": "New order object" }
}
```

Delete events carry a minimal object, e.g. `"bill": { "id": "...", "deleted_at": "..." }`. Connection events carry extra fields such as `update_url`, `disable_error`, `message`.

## Delivery Behavior

- Respond 2xx within **5 seconds** or the delivery is a failure.
- Retries use exponential backoff with jitter for up to 15 minutes from creation (about 15s, 25s, 1.5m, 3m, 5.5m between attempts), then the webhook is permanently failed.
- The same payload may be sent more than once, and a small percentage may be dropped. Make handlers idempotent and poll the API periodically.

## Full Event Reference

See [Rutter's webhook documentation](https://docs.rutter.com/implementation-guides/webhooks).
