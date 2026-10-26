# Hasura Webhooks Overview

## What Are Hasura Event Triggers?

Hasura v2 Event Triggers watch a table in a Postgres or MS SQL Server database and call a webhook
URL with a JSON payload when rows change. Delivery is at least once and events may arrive out of
order. This skill does not cover Hasura DDN (v3). Requests are not signed; you authenticate them
with a secret header that you add to the trigger.

## Common Event Types

The operation is in `event.op`.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `INSERT` | A row is inserted into the table | Send a welcome email, index the row |
| `UPDATE` | A row is updated (only delivered if new data differs from old) | Sync changes, audit trail |
| `DELETE` | A row is deleted | Remove from a search index, clean up |
| `MANUAL` | The trigger is invoked manually from the console or API | Backfills, re-sending events |

## Event Payload Structure

Requests are `POST` with `Content-Type: application/json`.

```json
{
  "created_at": "2020-07-29T10:00:00.000Z",
  "delivery_info": { "current_retry": 0, "max_retries": 0 },
  "event": {
    "data": { "new": { "id": 1, "name": "John" }, "old": null },
    "op": "INSERT",
    "session_variables": { "x-hasura-role": "admin" },
    "trace_context": { "span_id": "123", "trace_id": "456" }
  },
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "table": { "name": "users", "schema": "public" },
  "trigger": { "name": "insert_user" }
}
```

| Field | Description |
|-------|-------------|
| `event.op` | `INSERT`, `UPDATE`, `DELETE` or `MANUAL` |
| `event.data.old` / `event.data.new` | Row values before and after; null where not applicable |
| `event.session_variables` | `x-hasura-*` session variables (Postgres only) |
| `event.trace_context` | `span_id` and `trace_id` |
| `id` | UUID of the invocation; use it for idempotency |
| `delivery_info` | `current_retry` and `max_retries` |
| `trigger.name`, `table.schema`, `table.name` | Which trigger fired, on which table |

Old/new by op: `INSERT` old is null; `DELETE` new is null; `MANUAL` old is null and new is the
current row. On MS SQL Server, an `UPDATE` that changes the primary key sends only `new`.

## Responses and Retries

A `2xx` response is success. Any other status counts as a failed invocation and is retried per the
trigger's `retry_conf` (`num_retries` default 0, `interval_sec` default 10, `timeout_sec`
default 60). A `Retry-After` header on a non-2xx response schedules one more delivery after that
many seconds.

## Full Event Reference

See Hasura's [Event Trigger payload](https://hasura.io/docs/2.0/event-triggers/payload/) and
[Create an Event Trigger](https://hasura.io/docs/2.0/event-triggers/create-trigger/) docs.
