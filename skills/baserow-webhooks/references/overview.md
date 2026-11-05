# Baserow Webhooks Overview

## What Are Baserow Webhooks?

Baserow is an open-source no-code database. Table webhooks (Baserow Cloud and self-hosted) notify
an external URL when data changes. You choose the HTTP method (GET, POST, PUT, PATCH or DELETE),
the URL, the events, and optional custom headers. A JSON body is sent with every call, even GET.

Webhooks are **not signed**. Baserow sends `X-Baserow-Event` and `X-Baserow-Delivery` headers plus
the custom headers you add. Authenticate by adding a secret header (see [setup.md](setup.md)).

Baserow Cloud keeps at most 5,000 pending calls per webhook (extra calls are dropped) and handles
calls one at a time. The docs say a call succeeds only if your endpoint returns `200 OK` (the
source code checks for any status below 400); failed calls are retried a limited number of times.

## Common Event Types

| `event_type` | Triggered When | Common Use Cases |
|--------------|----------------|------------------|
| `rows.created` | Rows are added | Sync new records, notify a channel |
| `rows.updated` | Rows are modified | Mirror changes, trigger workflows |
| `rows.deleted` | Rows are removed | Remove records downstream |
| `view.created` | A view is added | Audit schema changes |
| `view.updated` | A view's configuration changes | Audit schema changes |
| `view.deleted` | A view is removed | Audit schema changes |
| `field.created` | A field is added | Keep a schema mirror current |
| `field.updated` | A field's properties change | Keep a schema mirror current |
| `field.deleted` | A field is removed | Keep a schema mirror current |

`rows.created`, `rows.updated`, `rows.deleted` and `view.created` appear verbatim in Baserow's
documentation; the other view and field strings are in its event-type classes.
`row.created`, `row.updated` and `row.deleted` are deprecated, and Baserow's current source no longer
registers them; migrate to the `rows.*` batch types. A conditional row update is `rows.updated`
limited to chosen fields. Row enters view sends `view.rows_entered`, an enterprise feature that Send
everything doesn't include; its rows arrive in `rows`.

## Event Payload Structure

Example for `view.created`:

```json
{
  "table_id": 50000,
  "database_id": 1000,
  "workspace_id": 300,
  "event_id": "00000000-0000-0000-0000-000000000000",
  "event_type": "view.created",
  "view": { "id": 0, "table_id": 0, "name": "View", "type": "grid" }
}
```

- `event_type` and `event_id` describe what happened. For idempotency use `event_id` together
  with `batch_id`: a large `view.rows_entered` call, or a `rows.updated` call caused by a linked table, is split into several calls that share one `event_id` and carry `batch_id` 1, 2, ... (Baserow source; `batch_id` is absent when there is one call).
- `table_id`, `database_id` and `workspace_id` identify the source.
- `rows.created` and `rows.updated` carry an `items` array with the full affected rows, and
  `rows.deleted` carries only `row_ids`. View and field events carry the object itself, or just
  `view_id` or `field_id` on delete.
- Route on the body's `event_type`. On a call caused by a change in a linked table, the body says
  `rows.updated`, there is no `old_items`, and the `X-Baserow-Event` header can name the event from
  the other table.
- To learn who made a change, add a **Last Modified By** field to the table; row payloads then
  include it.

## Full Event Reference

For the full list, see [Baserow's webhook documentation](https://baserow.io/user-docs/webhooks).
