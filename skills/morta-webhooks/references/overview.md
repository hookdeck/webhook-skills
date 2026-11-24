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
| `contextHubId` | Hub ID |
| `contextDocumentId`, `contextDocumentSectionId`, `contextDocumentResponseId` | Related document, section, response IDs, or `null` |
| `contextProjectId`, `contextProcessId`, `contextProcessSectionId`, `contextProcessResponseId` | Deprecated copies of the four fields above, with the same values |
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
  "contextHubId": "9f1c0e2a-1b2c-4d3e-8f4a-5b6c7d8e9f00",
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
| `hub.created` | A hub is created | Provision related resources |
| `hub.duplication_failed` | A hub duplication job fails | Alert an owner (`change` carries the error) |
| `member.created` | A user is added to a hub | Onboarding automation |
| `document.response_submitted` | A document response is submitted | Start a review workflow |

## All Documented Events (75)

Hub: `hub.created`, `hub.updated`, `hub.deleted`, `hub.restored`, `hub.searched`,
`hub.duplicated`, `hub.duplication_failed`, `hub.joined`, `hub.read`

Members and policies: `member.created`, `member.updated`, `member.deleted`, `policy.created`,
`policy.updated`, `policy.deleted`

Tables: `table.created`, `table.updated`, `table.deleted`, `table.restored`, `table.duplicated`,
`table.duplication_failed`, `table.csv_uploaded`, `table.truncated`, `table.read`,
`table.column_created`, `table.column_updated`, `table.column_deleted`, `table.row_created`,
`table.row_updated`, `table.row_deleted`, `table.cell_updated`, `table.view_created`,
`table.view_updated`, `table.view_deleted`, `table.view_duplicated`, `table.view_read`,
`table.comment_created`, `table.comment_updated`, `table.comment_deleted`, `table.thread_created`,
`table.thread_resolved`, `table.thread_reopened`, `table.thread_deleted`, `table.sync_created`,
`table.sync_completed`, `table.sync_error`, `table.sync_deleted`, `table.join_error`

Documents: `document.created`, `document.updated`, `document.deleted`,
`document.restored`, `document.duplicated`, `document.duplication_failed`, `document.read`,
`document.section_created`, `document.section_updated`, `document.section_deleted`,
`document.section_duplicated`, `document.section_restored`, `document.pdf_exported`,
`document.word_exported`, `document.response_created`, `document.response_updated`,
`document.response_submitted`, `document.response_reset`, `document.response_deleted`,
`document.response_restored`, `document.comment_created`, `document.comment_updated`,
`document.comment_deleted`, `document.thread_created`, `document.thread_resolved`,
`document.thread_reopened`, `document.thread_deleted`

### Legacy names

Hub events were named `project.*` and document events `process.*` (for example `project.created`,
`process.response_submitted`). Morta deprecated those names but still delivers them: a webhook
subscribed to `process.updated` receives `"event": "process.updated"`. A webhook subscribed under
both names gets one delivery per event, named with the new name. Accept both spellings while any
old subscription exists.

`user.*` account events are audit-log only and are never delivered by webhook. `hub.read` and
similar `*.read` events are high volume: subscribe only if you need them.

## Full Event Reference

For the complete list and per-event `context` shapes, see [Morta's events documentation](https://docs.morta.io/webhooks/events).
The machine-readable list is also available from `GET /v1/notifications/event-types`.
