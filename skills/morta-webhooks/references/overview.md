# Morta Webhooks Overview

## What Are Morta Webhooks?

Morta is a data and document platform for construction projects (hubs, tables, documents). A hub's
notification (Hub > Settings > Webhooks) posts the events you choose to your endpoint as an HTTP
`POST`. You can limit a notification to specific event types and to a specific table or document.
Morta signs every webhook with a `Morta-Signature` header.

Delivery, from Morta's docs: any `2xx` response acknowledges the webhook. Any other status, or no
answer within 10 seconds, marks the delivery failed. Retries are not documented.

## Payload Envelope

Every event shares one top-level envelope. Only `event` and `context` vary by event type.

| Field | Description |
|-------|-------------|
| `id` | Unique public ID of the event (use it as the idempotency key) |
| `event` | Event identifier in `resource.verb` form, e.g. `table.row_created` |
| `resourceId` | Public ID of the primary resource (the hub ID for `member.*`; the table ID for `table.view_*`) |
| `change` | A JSON-encoded **string** describing the diff, or `null`. Parse it a second time |
| `context` | Object whose shape depends on the event (e.g. `{ "rows": [...] }`) |
| `user` | User that triggered the event, or `null` for system events |
| `createdAt` | UTC timestamp the event was generated |
| `contextProjectId` | Hub ID |
| `contextProcessId`, `contextProcessSectionId`, `contextProcessResponseId` | Related document, section, response IDs, or `null` |
| `contextTableId`, `contextTableViewId`, `contextTableColumnId` | Related table, view, column IDs, or `null` |

```json
{
  "id": "1df6bd8a-b8a3-49a2-b07b-0de3f3cecbed",
  "event": "table.row_created",
  "resourceId": "4e687ada-900a-4562-b493-6c6f67ffca6e",
  "change": "{\"added\": 1}",
  "context": { "rows": ["See the TableRow schema"] },
  "user": "See the User schema",
  "createdAt": "2020-08-27T14:20:28.405158",
  "contextProjectId": "9f1c0e2a-1b2c-4d3e-8f4a-5b6c7d8e9f00",
  "contextTableId": "4e687ada-900a-4562-b493-6c6f67ffca6e"
}
```

(Values like `"See the User schema"` are placeholders in Morta's docs for objects documented in
their API reference.)

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `table.row_created` | Rows are added to a table | Sync new data downstream |
| `table.row_updated` | Table rows change | Keep a mirror up to date |
| `project.created` | A hub is created | Provision related resources |
| `project.duplication_failed` | A hub duplication job fails | Alert an owner (`change` carries the error) |
| `member.created` | A user is added to a hub | Onboarding automation |
| `process.response_submitted` | A document response is submitted | Start a review workflow |

## All Documented Events (76)

Hub: `project.created`, `project.updated`, `project.deleted`, `project.restored`, `project.searched`,
`project.duplicated`, `project.duplication_failed`, `project.joined`, `project.read`

Members and policies: `member.created`, `member.updated`, `member.deleted`, `policy.created`,
`policy.updated`, `policy.deleted`

Tables: `table.created`, `table.updated`, `table.deleted`, `table.restored`, `table.duplicated`,
`table.duplication_failed`, `table.csv_uploaded`, `table.truncated`, `table.read`,
`table.column_created`, `table.column_updated`, `table.column_deleted`, `table.row_created`,
`table.row_updated`, `table.row_deleted`, `table.cell_updated`, `table.view_created`,
`table.view_updated`, `table.view_deleted`, `table.view_duplicated`, `table.view_read`,
`table.comment_created`, `table.comment_updated`, `table.comment_deleted`, `table.thread_created`,
`table.thread_resolved`, `table.thread_reopened`, `table.thread_deleted`, `table.sync_created`,
`table.sync_completed`, `table.sync_error`, `table.sync_deleted`, `table.join_error`,
`table.script_error`

Documents (`process.*`): `process.created`, `process.updated`, `process.deleted`,
`process.restored`, `process.duplicated`, `process.duplication_failed`, `process.read`,
`process.section_created`, `process.section_updated`, `process.section_deleted`,
`process.section_duplicated`, `process.section_restored`, `process.pdf_exported`,
`process.word_exported`, `process.response_created`, `process.response_updated`,
`process.response_submitted`, `process.response_reset`, `process.response_deleted`,
`process.response_restored`, `process.comment_created`, `process.comment_updated`,
`process.comment_deleted`, `process.thread_created`, `process.thread_resolved`,
`process.thread_reopened`, `process.thread_deleted`

`user.*` account events are audit-log only and are never delivered by webhook. `project.read` and
similar `*.read` events are high volume: subscribe only if you need them.

## Full Event Reference

For the complete list and per-event `context` shapes, see [Morta's events documentation](https://docs.morta.io/webhooks/events).
The machine-readable list is also available from `GET /v1/notifications/event-types`.
