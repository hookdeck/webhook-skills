# Shortcut Webhooks Overview

## What Are Shortcut Webhooks?

Shortcut (formerly Clubhouse) outgoing webhooks notify a URL you register whenever something changes in your workspace. They track changes made by users and by API token requests, including workflow state changes made by version control integrations such as GitHub. The docs describe this as the v1 Outgoing Webhook API, which may have breaking changes documented in its change log.

Events fire whenever Stories or Epics are created, updated, or deleted, including all changes to comments and tasks.

## Common Event Types

Shortcut has no event-type header. Each action in the `actions` array carries an `entity_type` and an `action`:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `story create` | A story is created | Notify a Slack channel, create a branch |
| `story update` | A story changes (state, owner, estimate, epic, iteration) | Trigger CI at Ready for Deploy, notify on estimate change |
| `story delete` | A story is deleted | Remove it from your own records |
| `epic update` | An epic changes | Sync status, notify stakeholders |
| `story-comment create` | A comment is added | Bot replies, command parsing |

The docs show `entity_type` values like `story` and `epic` and `action` values like `create` and `update`; they do not publish a complete list. Comments and tasks use the REST API's entity types (`story-comment`, `story-task`); check a real delivery if in doubt, and log unknown combinations rather than failing on them.

## Event Payload Structure

```json
{
  "id": "595285dc-9c43-4b9c-a1e6-0cd9aff5b084",
  "changed_at": "2017-06-27T16:20:44Z",
  "primary_id": 16927,
  "member_id": "56d8a839-1c52-437f-b981-c3a15a11d6d4",
  "version": "v1",
  "actions": [
    {
      "id": 16927,
      "entity_type": "story",
      "action": "update",
      "name": "test story",
      "changes": {
        "started": { "new": true, "old": false },
        "workflow_state_id": { "new": 1495, "old": 1493 },
        "owner_ids": { "adds": ["56d8a839-1c52-437f-b981-c3a15a11d6d4"] }
      }
    }
  ],
  "references": [
    { "id": 1495, "entity_type": "workflow-state", "name": "Ready for Deploy" },
    { "id": 1493, "entity_type": "workflow-state", "name": "Ready for Dev" }
  ]
}
```

| Field | Description |
|-------|-------------|
| `id` | Unique identifier (UUID) for the webhook event; use it for idempotency |
| `primary_id` | ID of the primary entity. Absent when there is no single primary entity |
| `member_id` | Member who performed the action |
| `changed_at` | When the event occurred |
| `actions` | Array of changed objects; each has `id`, `entity_type`, `action`, `name`, `changes` |
| `references` | Entities referenced by the event (for example workflow states) |

One delivery can contain several actions, so loop over `actions` rather than reading only the first.

## Full Event Reference

See [Shortcut's Outgoing Webhook documentation](https://developer.shortcut.com/api/webhook/v1).
