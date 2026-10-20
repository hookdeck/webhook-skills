# Attio Webhooks Overview

## What Are Attio Webhooks?

Attio is a CRM. Its V2 webhooks send an HTTPS `POST` to your target URL when data in a workspace changes: records, list entries, notes, tasks, comments, lists, attributes and more. They are commonly used for real-time syncs (ETL pipelines, data warehouses) and for triggering automations. Attio's own Zapier integration runs on them.

Each webhook has one or more **subscriptions**. A subscription is an `event_type` plus an optional **filter**. Within a workspace each (target URL, event type, filter) combination must be unique; duplicates are rejected with `409 uniqueness_conflict`.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `record.created` | A record is created | Sync new people/companies/deals to another system |
| `record.updated` | An attribute on a record changes | Field-level sync; react to stage or owner changes |
| `record.deleted` | A record is deleted | Remove from downstream systems |
| `record.merged` | Two records are merged | Re-point foreign keys to the surviving record |
| `list-entry.created` | A record is added to a list | Pipeline entry automations |
| `list-entry.updated` | A list attribute on an entry changes | Pipeline stage changes (e.g. "Status") |
| `list-entry.deleted` | A record is removed from a list | Clean up pipeline state |
| `note.created` | A note is created | Mirror notes to a support tool |
| `task.created` | A task is created | Create tickets or reminders elsewhere |
| `comment.created` | A comment is created | Notify a chat channel |

## Full Event List

All V2 event types from Attio's webhook OpenAPI spec:

| Group | Event types |
|-------|-------------|
| Records | `record.created`, `record.updated`, `record.deleted`, `record.merged` |
| List entries | `list-entry.created`, `list-entry.updated`, `list-entry.deleted` |
| Lists | `list.created`, `list.updated`, `list.deleted` |
| List attributes | `list-attribute.created`, `list-attribute.updated` |
| Object attributes | `object-attribute.created`, `object-attribute.updated` |
| Notes | `note.created`, `note.updated` (title only), `note-content.updated` (body), `note.deleted` |
| Tasks | `task.created`, `task.updated`, `task.deleted` |
| Comments | `comment.created`, `comment.resolved`, `comment.unresolved`, `comment.deleted` |
| Activities | `activity.created`, `activity.updated`, `activity.deleted` |
| Activity attributes | `activity-attribute.created`, `activity-attribute.updated` |
| Activity records | `activity-record.created`, `activity-record.deleted` |
| Call recordings | `call-recording.created` |
| Workspace members | `workspace-member.created` |

> **Deprecated V1 events:** `entry.created`, `entry-attribute.updated` and `entry.deleted` were replaced by `list-entry.created`, `list-entry.updated` and `list-entry.deleted`. Their payloads differ (`collection_id` became `id.list_id`).

## Event Payload Structure

Every delivery is an envelope:

```json
{
  "webhook_id": "23e42eaf-323a-41da-b5bb-fd67eebda553",
  "events": [
    {
      "event_type": "list-entry.updated",
      "id": {
        "workspace_id": "14beef7a-99f7-4534-a87e-70b564330a4c",
        "list_id": "33ebdbe9-e529-47c9-b894-0ba25e9c15c0",
        "entry_id": "2e6e29ea-c4e0-4f44-842d-78a891f8c156",
        "attribute_id": "41252299-f8c7-4b5e-99c9-4ff8321d2f96"
      },
      "parent_object_id": "97052eb9-e65e-443f-a297-f2d9a4a7f795",
      "parent_record_id": "bf071e1f-6035-429d-b874-d83ea64ea13b",
      "actor": { "type": "workspace-member", "id": "50cf242c-7fa3-4cad-87d0-75b1af71c57b" }
    }
  ]
}
```

| Field | Description |
|-------|-------------|
| `webhook_id` | The webhook that triggered this delivery |
| `events[]` | Array of events. Currently exactly one per delivery, but may be batched in future |
| `events[].event_type` | Event type string, e.g. `record.updated` |
| `events[].id` | Composite ID; always includes `workspace_id`, plus type-specific IDs (`object_id`/`record_id`, `list_id`/`entry_id`, `note_id`, `task_id`, `comment_id`, and `attribute_id` on updates) |
| `events[].actor` | Who caused the change: `type` is `workspace-member`, `api-token`, `system` or `app` (may be `null`) |
| `parent_object_id` / `parent_record_id` | On list-entry and note events: the record the entry or note belongs to |
| `duplicate_object_id` / `duplicate_record_id` | On `record.merged`: one of the original records (each merge fires two events) |

Payloads contain **IDs only, not record data**. Call the Attio REST API (e.g. `GET /v2/objects/{object}/records/{record_id}`) to fetch current values.

## Filtering

Subscriptions can carry a filter (API only) using `$and` / `$or` with `field`, `operator` (`equals`, `not_equals`) and `value`. Fields use dot notation over the event payload, e.g. `id.list_id` or `actor.type`:

```json
{
  "$and": [
    { "field": "id.list_id", "operator": "equals", "value": "<list-id>" },
    { "field": "actor.type", "operator": "equals", "value": "workspace-member" }
  ]
}
```

A `null` filter matches every event. Test events sent from the dashboard ignore filters.

## Delivery Guarantees

- At-least-once delivery; use the `Idempotency-Key` header (stable across retries and redeliveries) to deduplicate.
- Any `2xx` response counts as success. Other codes, or no response within **5 seconds**, are retried up to 10 times with exponential back-off over about 3 days. After that the webhook is marked `degraded` (and `inactive` after 7 more days).
- Delivery is rate-limited to 25 requests/second per target URL.

## Full Event Reference

For schemas and examples of every event, see [Attio's webhook reference](https://docs.attio.com/rest-api/webhook-reference/record-events/recordcreated) and the [webhooks guide](https://docs.attio.com/rest-api/guides/webhooks).
