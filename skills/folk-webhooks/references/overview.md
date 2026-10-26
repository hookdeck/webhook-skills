# folk Webhooks Overview

## What Are folk Webhooks?

[folk](https://www.folk.app) is a CRM. When you create a webhook with a target URL and a list of subscribed events, folk sends an HTTP `POST` with a JSON event to that URL whenever one of those events occurs in your workspace. The system adheres to the [Standard Webhooks](https://www.standardwebhooks.com/) specification: each delivery carries `webhook-id`, `webhook-timestamp` and `webhook-signature` headers. See [About webhooks](https://developer.folk.app/webhooks/about).

You can also add filters through the API, for example to only be notified when a person is added to a specific group. Each event type supports a different set of filters.

## Which folk Webhook Events Are There?

| Event | Triggered when | Common use cases |
|-------|----------------|------------------|
| `person.created` | A person is created in the workspace | Enrich or route new leads |
| `person.updated` | A person's native attributes or custom fields are updated | Sync changes to another system |
| `person.deleted` | A person is deleted (`data.details` has `name` and `emails`) | Remove the contact elsewhere |
| `person.groups_updated` | A person's groups are updated | Trigger group-based workflows |
| `person.workspace_interaction_metadata_updated` | A person's workspace interaction metadata is updated | Track engagement |
| `company.created` | A company is created | Create the account elsewhere |
| `company.updated` | A company is updated | Sync changes |
| `company.deleted` | A company is deleted (`data.details` has `name` and `emails`) | Archive the account |
| `company.groups_updated` | A company's groups are updated | Trigger group-based workflows |
| `object.created` | A custom object (for example a deal) is created | Start a deal workflow |
| `object.updated` | An object is updated | React to pipeline status changes |
| `object.deleted` | An object is deleted (`data.details` has `name`) | Clean up |
| `note.created` | A note is created | Mirror notes |
| `note.updated` | A note is updated | Mirror notes |
| `note.deleted` | A note is deleted | Mirror notes |
| `reminder.created` | A reminder is created | Sync tasks |
| `reminder.updated` | A reminder is updated | Sync tasks |
| `reminder.deleted` | A reminder is deleted | Sync tasks |
| `reminder.triggered` | A reminder is triggered | Notify the owner |
| `person_enrichment.finished` | An enrichment ends (`changes` has `status`, `errorReason`, `finishedAt`) | Fetch results from `data.url` |

The events page lists these under Person, Company, Object, Note, Reminder and Person enrichment events. Its example for `person.workspace_interaction_metadata_updated` shows `"type": "person.groups_updated"`, which looks like a docs typo: dispatch on the event name above.

## What Does a folk Webhook Payload Look Like?

Every event has the same envelope:

| Field | Description |
|-------|-------------|
| `id` | Unique event ID (`evt_...`), same as the `webhook-id` header |
| `type` | Event type, for example `person.updated` |
| `createdAt` | ISO 8601 time the event occurred |
| `source` | API URL of the webhook that delivered the event |
| `data.id` | ID of the resource (`per_...`, `com_...`, `obj_...`, `nte_...`, `rmd_...`, `enr_...`) |
| `data.url` | API URL to fetch the full resource |
| `data.changes` | Updates only. Array of `{ path, type, value }` where `type` is `add`, `remove` or `set` |
| `data.details` | Deletions only. Properties of the deleted resource, which can no longer be fetched |

```json
{
  "id": "evt_6004f2ef-dcc3-4c56-a704-9326730ad100",
  "type": "person.updated",
  "createdAt": "2025-09-30T09:55:52.715Z",
  "source": "https://api.folk.app/v1/webhooks/wbk_2f15ec4f-0f70-4884-a43d-1f88ef7a6665",
  "data": {
    "id": "per_05837e2d-9bf7-4f17-8729-e95f1be4de67",
    "url": "https://api.folk.app/v1/people/per_05837e2d-9bf7-4f17-8729-e95f1be4de67",
    "changes": [{ "path": ["firstName"], "type": "set", "value": "John" }]
  }
}
```

A person's `description` value is never included in `changes`.

## How Does folk Retry and Order Deliveries?

- A delivery succeeds on any `2xx`. Everything else is a failure.
- folk retries for up to one day: immediately, then after 5s, 5m, 30m, 2h, 5h, 10h, 14h, 20h and 24h.
- When retries run out, or the error rate is high, folk deactivates the webhook and emails you. Re-activate it to receive events again. A `410 Gone` response deactivates it at once, without retries.
- Order isn't guaranteed. Creating a deal can produce `object.created`, `person.updated` and `company.updated` in any order. Don't depend on ordering, and GET `data.url` for the current state.
- Webhook routes should be exempt from CSRF protection, and handlers should be idempotent (dedupe on `webhook-id`).

## Full Event Reference

For the complete list and payload examples, see [folk's events and payloads documentation](https://developer.folk.app/webhooks/events-and-payloads).
