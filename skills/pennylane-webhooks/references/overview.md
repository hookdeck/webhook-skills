# Pennylane Webhooks Overview

## What Are Pennylane Webhooks?

Pennylane is a French accounting platform. Its Webhooks API sends an HTTP `POST` with a JSON body (`Content-Type: application/json`, `User-Agent: Pennylane-Webhooks`) to your HTTPS `callback_url` when something changes in a company, instead of you polling the API. The feature is in **Beta**; Pennylane recommends falling back on the changelog endpoints during this phase. Subscriptions are created and managed through the API (`companies:webhook_subscriptions:all` scope), not a dashboard form.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `customer_invoice.e_invoicing_status_updated` | A customer invoice's e-invoicing (PDP) status changes | Track whether an invoice was accepted, refused or collected |
| `dms_file.created` | A DMS (document management) file is created | Ingest new documents |
| `supplier_invoice.e_invoicing_received` | A supplier invoice is received via e-invoicing (invoicing hub) | Import supplier invoices into your own system |

Required OAuth scopes for deliveries: `customer_invoices:readonly` or `:all`, `dms_files:readonly` or `:all`, `supplier_invoices:readonly` or `:all`. Subscribing without the scope is allowed, but Pennylane skips deliveries for that event until your credential holds it.

## Event Payload Structure

```json
{
  "id": 987654,
  "event": "customer_invoice.e_invoicing_status_updated",
  "retry_count": 0,
  "created": 1657875952,
  "data": {
    "context": { "company_id": 12345, "firm_id": 678 },
    "object": { "id": 555001, "e_invoicing": { "status": "accepted" } },
    "previous_attributes": { "e_invoicing": { "status": "submitted" } }
  }
}
```

- `id`: unique delivery id. Use it for idempotency.
- `event`: the event name (dispatch on this).
- `retry_count`: `0` on the first attempt.
- `created`: unix seconds when the event occurred.
- `data.context`: the `company_id` and `firm_id` the change belongs to.
- `data.object`: the event payload. For `dms_file.created` and `supplier_invoice.e_invoicing_received` it is `{ "id": ..., "created_at": ... }`.
- `data.previous_attributes`: present only for update events.

`e_invoicing.status` is one of `accepted`, `approved`, `collected`, `in_dispute`, `partially_collected`, `refused`, `rejected`, `sent`, `submitted` (or `null` in `previous_attributes` on the first transition).

## Delivery and Retries

- Respond 2xx within a few seconds; a slow response counts as a timeout and is retried.
- Delivery is **at-least-once** and **unordered**: deduplicate on `id` and reconcile state from the payload.
- A response that isn't 2xx in time is treated as a failed delivery and retried. Pennylane doesn't document the retry schedule (attempts or intervals); repeated failures over a sustained period disable the subscription (`disabled_reason: repeated_failure`).
- **401, 403, 404 or 410 disable the subscription** as a permanent delivery error (`permanent_error`). Don't return these for a bad signature.
- A disabled subscription is not re-enabled automatically: update it with `"enabled": true` once the endpoint is fixed.
- Optional IP allowlist (port 443): `34.242.41.54`, `54.220.249.5`, `54.75.175.133`, `54.73.179.170`, `52.17.78.48`, `52.215.138.198`. Signature verification is the recommended check.

## Full Event Reference

See [Pennylane webhooks](https://pennylane.readme.io/docs/webhooks), [List of webhook events](https://pennylane.readme.io/docs/list-of-events) and [Failures & Lifecycle](https://pennylane.readme.io/docs/failures-lifecycle).
