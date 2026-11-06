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
| `add_link`, `remove_link`, `update_links`, `update_rows_links` | A link between rows changes | Keep relations in step |

Link bodies have no `row_id` or `row_data`. `add_link` carries `link_id`, `table1_*` and `table2_*` fields, and `row_data1` and `row_data2`. `update_rows_links` also carries `row_id_list` and `other_rows_ids_map`.

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
| `op_type` | `insert_row`, `modify_row`, `delete_row`, or a link value |
| `op_time` | Unix timestamp with fractions |
| `table_id`, `table_name` | Table (4-char id) |
| `row_data` | Column values, cut to 10 columns, 1,000 characters of text and 10 list entries. For `modify_row`, each object has `value` and `old_value`. Empty on an empty new row and in the delete example |
| `op_app` | Name of the API token, when the change came from the API |
| `row_count` | Only on a batch operation, such as a multi-row paste or a batch API call (it can be 1). One webhook is sent, and `row_id`, `row_name` and `row_data` describe a single row, usually the first |

## Delivery Behavior

- SeaTable treats any **2xx** as success and waits **30 seconds**. After **5 consecutive** errors (another status, a redirect or no response) the webhook becomes `invalid` and stops sending. A delivery that can't be made at all (DNS failure, connection refused, certificate error, non-public URL) makes it `invalid` on the first error. To reactivate it, edit the webhook and save again.
- Failed deliveries are **not retried**, and changes made while the webhook is invalid are never sent. SeaTable says to treat a webhook as a trigger and also sync on a schedule.
- The payload has no event id. For idempotency, key on `dtable_uuid` + `row_id` + `op_type` + `op_time`.

## Full Event Reference

See SeaTable's [webhook data structure](https://seatable.com/help/webhook-data-structure/) and [creating a webhook](https://seatable.com/help/create-delete-webhook-seatable/).
