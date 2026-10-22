# SeaTable Webhooks Overview

## What Are SeaTable Webhooks?

A SeaTable webhook is created per **base**. Once active, every change to the contents of the base is sent to the target URL as an HTTP `POST`. The request body is JSON. A secret key is optional; when set, SeaTable adds an `X-Seatable-Signature` header.

## Common Event Types

The top-level `event` is currently always `update` (SeaTable says other values may be added later). The change type is `data.op_type`:

| Event (`data.op_type`) | Triggered When | Common Use Cases |
|------------------------|----------------|------------------|
| `insert_row` | A row is added or duplicated (web UI, form, API) | Sync new records, notify a channel |
| `modify_row` | A row's content is changed | Push field changes downstream, trigger workflows |
| `delete_row` | A row is deleted | Remove records from other systems |

Docs inconsistency: the data-structure page lists `insert_row`, but a sample on the secret-key page shows `create_row`. Handle both.

These do **not** trigger a webhook: adding a column, a column comment, creating a view, or a row lock.

## Event Payload Structure

```json
{
  "event": "update",
  "data": {
    "dtable_uuid": "fae0a3a42ba94df88e8303fd385e37de",
    "row_id": "QoNno3QiTF26sxmG1sl3_g",
    "op_user": "4bc9a7c79c5942c5b6238413f2132bea@auth.local",
    "op_type": "modify_row",
    "op_time": 1649929622.589,
    "table_id": "9g8f",
    "table_name": "Opportunities",
    "row_name": "",
    "row_data": [{
      "column_key": "589r",
      "column_name": "Prio",
      "column_type": "single-select",
      "column_data": { "options": [] },
      "value": "381992",
      "old_value": ""
    }]
  }
}
```

| Field | Notes |
|-------|-------|
| `dtable_uuid` | Base UUID (32 chars) |
| `row_id` | Row id (22 chars) |
| `op_user` | User id + `@auth.local` |
| `op_type` | `insert_row`, `modify_row`, `delete_row` |
| `op_time` | Unix timestamp with fractions |
| `table_id`, `table_name` | Table (4-char id) |
| `row_data` | Empty for insert and delete; for `modify_row`, one object per changed column with `value` and `old_value` |
| `op_app` | Name of the API token, when the change came from the API |
| `row_count` | Only when one web-editor action changed several rows (for example a multi-row paste); one webhook is sent, not one per row |

## Delivery Behavior

- SeaTable expects **HTTP 200**. After **5 consecutive** non-200 responses (or no response) the webhook becomes `invalid` and stops sending (up to version 3.4 a single error was enough). To reactivate it, edit the webhook and save again.
- The payload has no event id. For idempotency, key on `dtable_uuid` + `row_id` + `op_type` + `op_time`.

## Full Event Reference

See SeaTable's [webhook data structure](https://seatable.com/help/webhook-data-structure/) and [creating a webhook](https://seatable.com/help/create-delete-webhook-seatable/).
