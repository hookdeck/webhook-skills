# Grist Webhooks Overview

## What Are Grist Webhooks?

Grist webhooks "notify external services whenever rows are added to a table or if existing
rows are modified." Each webhook belongs to one document and watches one table. They are
configured in **Document Settings** (see [setup.md](setup.md)).

Webhooks carry no signature. The only credential is the optional **Header Authorization**
field, sent verbatim as the `Authorization` header (see [verification.md](verification.md)).

## What Event Types Does Grist Send?

The payload has no event field. The event types are selected in the webhook's configuration:

| Event type | Triggered When | Common Use Cases |
|------------|----------------|------------------|
| `add` | A row is added to the table, or a row's Ready column becomes true | Notify a CRM, create a ticket, start a workflow |
| `update` | An existing row is modified (and, if set, one of the filtered columns changed) | Sync changes, audit, re-run a calculation |

A webhook can be set to either or both. Because the request does not say which one fired,
treat each row idempotently (an upsert keyed on `id`).

## Payload Structure

The body is a JSON **array of row objects**, each with the row `id`, `manualSort` and the
table's column values:

```json
[
  { "id": 29, "manualSort": 29, "Title": "Trophy", "Price": 60, "Purchase_status": "wishlisted" },
  { "id": 24, "manualSort": 24, "Title": "Dataman", "Price": 50, "Purchase_status": "own digitally" }
]
```

Several rows that trigger the same webhook are sent together in one payload. The optional
**Ready column** (a Toggle column) gates which rows are visible: while it is false, changes do
not trigger the webhook; when it turns true the row triggers `add`, and later changes trigger
`update`.

## Retries and the Queue

If delivery fails, Grist "will keep retrying periodically." Payloads are delivered from a
batched queue and removed on a successful delivery. Return `2xx` only once you have accepted
the rows. The webhook's **Status** field shows errors, and **Clear Queue** discards pending
payloads.

## Full Reference

See Grist's webhook documentation: https://support.getgrist.com/webhooks/
