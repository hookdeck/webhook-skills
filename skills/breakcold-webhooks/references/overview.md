# Breakcold Webhooks Overview

## What Are Breakcold Webhooks?

Breakcold is a sales CRM. An outbound webhook sends CRM changes (records, notes, tasks, relations, calls, files) from your workspace to an HTTPS endpoint you control. Each delivery is an HTTP `POST` with a JSON body. Breakcold only delivers to active endpoints that subscribe to the event, and record-based events can be filtered by object type.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `record.created` | A new record is created | Sync new contacts or companies to another system |
| `record.updated` | A record field is updated | Keep a data warehouse or billing system current |
| `record.deleted` | A record is deleted | Remove the record downstream |
| `note.created` | A note is added to a record | Mirror notes into a support or chat tool |
| `note.updated` | A note is edited | Update the mirrored note |
| `note.deleted` | A note is deleted | Remove the mirrored note |
| `task.created` | A task is linked to a record | Create a matching task elsewhere |
| `task.completed` | A task is marked completed | Trigger follow-up automation |
| `relation.added` | A relation is added between records | Link a person to a company downstream |
| `relation.removed` | A relation is removed | Unlink downstream |
| `call.linked` | A call recording is linked to a record | Fetch or index the call |
| `call.unlinked` | A call recording is unlinked | Remove the link |
| `file.uploaded` | A file is uploaded to a record | Archive attachments |
| `file.deleted` | A file is deleted from a record | Remove the archived copy |
| `webhook.test` | The endpoint's test button is pressed | Confirm reachability and verification |

## Headers

| Header | Description |
|--------|-------------|
| `Content-Type` | Always `application/json` |
| `X-Webhook-Signature` | `sha256=<hex>` HMAC-SHA256 signature |
| `X-Webhook-Event` | The event name, such as `record.created` |
| `X-Webhook-Delivery-Id` | The delivery event id; use it for idempotency |
| `X-Webhook-Timestamp` | Unix timestamp in seconds, used for signing |
| `User-Agent` | `Breakcold-Webhooks/1.0` |

## Event Payload Structure

Every event uses the same envelope:

```json
{
  "eventId": "evt_abc123",
  "timestamp": "2026-03-19T12:00:00.000Z",
  "workspaceId": "workspace_id",
  "event": "record.created",
  "data": {
    "id": "record_id",
    "objectType": "person",
    "objectTypeName": "Person",
    "name": "Ada Lovelace",
    "fields": { "name": "Ada Lovelace", "email": "ada@example.com" },
    "createdAt": "2026-03-19T12:00:00.000Z",
    "updatedAt": "2026-03-19T12:00:00.000Z"
  }
}
```

| `data` shape | Events |
|--------------|--------|
| `id`, `objectType`, `objectTypeName`, `name`, `fields`, `createdAt`, `updatedAt` | `record.created`, `record.updated` |
| `id`, `deleted` | `record.deleted` |
| `recordId`, `noteId`, `title` (+ `contentPlain`, `author`, timestamps on create/update) | `note.*` |
| `recordId`, `taskId`, `title`, `status`, `dueAt` | `task.*` |
| `sourceRecordId`, `targetRecordId`, `fieldDefinitionId`, `fieldSlug` | `relation.*` |
| `recordId`, `callId`, `recordName`, `meetingTitle` | `call.*` |
| `recordId`, `fileName` | `file.*` |

## Delivery

- Any `2xx` response accepts the delivery.
- Up to 3 attempts in total, retried after about 5 s and 30 s.
- 10 second request timeout.
- An endpoint is disabled after 50 consecutive failures.
- Delivery logs are kept for 30 days.

## Full Event Reference

See [Breakcold's webhook documentation](https://docs.breakcold.com/api/webhooks).
