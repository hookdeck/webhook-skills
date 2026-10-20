# ClickUp Webhooks Overview

## What Are ClickUp Webhooks?

ClickUp webhooks let you subscribe to events in a ClickUp Workspace (tasks, Lists, Folders, Spaces, Goals and Targets). When a subscribed event happens, ClickUp sends a `POST` request with a JSON body to the endpoint you registered.

Webhooks are created through the ClickUp API (`POST /api/v2/team/{team_id}/webhook`), not through the ClickUp UI. Each webhook:

- is tied to the user whose token created it (if that user is disabled, the webhook stops firing)
- can subscribe to one or more events, or `*` for all events
- can be scoped to one location: a Space, Folder, List, or task (the most specific one wins)
- gets its **own signing secret**, returned as `webhook.secret` in the create response

## What Does a ClickUp Webhook Request Look Like?

- Method is always `POST`
- `Content-Type` is always `application/json`
- `X-Signature` header carries the hex HMAC-SHA256 signature of the raw body
- The body contains `event`, `webhook_id`, and the ID of the affected resource (`task_id`, `list_id`, `folder_id`, `space_id`, `goal_id`, or `key_result_id`)
- When available, `history_items` describes what changed, with `before` and `after` values

```json
{
  "event": "taskStatusUpdated",
  "history_items": [
    {
      "id": "2800763136717140857",
      "type": 1,
      "date": "1642734631523",
      "field": "status",
      "parent_id": "162641062",
      "data": { "status_type": "custom" },
      "source": null,
      "user": { "id": 183, "username": "John", "email": "john@company.com" },
      "before": { "status": "to do", "type": "open" },
      "after": { "status": "in progress", "type": "custom" }
    }
  ],
  "task_id": "1vj37mc",
  "webhook_id": "7fa3ec74-69a8-4530-a251-8a13730bd204"
}
```

Typing notes from ClickUp:

- `history_items[].user.id` is an integer, not a string
- `history_items[].date` is Unix time in **milliseconds**, as a string
- Unset booleans (e.g. Custom Field checkmarks) may be `null` instead of `false`
- Custom Field values aren't normalized; cast them yourself

## Common Event Types

### Task events

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `taskCreated` | A new task is created (ClickUp also sends `taskStatusUpdated`) | Sync tasks to another system, notify a channel |
| `taskUpdated` | A task is updated | Keep an external copy in sync |
| `taskDeleted` | A task is deleted | Remove mirrored records |
| `taskPriorityUpdated` | A task's priority changes | Escalation alerts |
| `taskStatusUpdated` | A task's status changes | Workflow automation, reporting |
| `taskAssigneeUpdated` | An assignee is added or removed | Notify the new assignee |
| `taskDueDateUpdated` | A task's due date changes | Calendar sync, reminders |
| `taskTagUpdated` | A tag is added or removed | Routing and triage |
| `taskMoved` | A task moves to a new List | Re-route ownership |
| `taskCommentPosted` | A comment is added to a task | Chat notifications, bots |
| `taskCommentUpdated` | A task comment is edited | Keep comment mirrors in sync |
| `taskTimeEstimateUpdated` | A time estimate is added or updated | Capacity planning |
| `taskTimeTrackedUpdated` | Tracked time is added, updated, or deleted | Billing and timesheets |

Adding an attachment to a task does **not** trigger `taskUpdated`, but uploading an attachment to a task comment does.

### List, Folder, and Space events

| Event | Triggered When |
|-------|----------------|
| `listCreated` / `listUpdated` / `listDeleted` | A List is created, updated, or deleted |
| `folderCreated` / `folderUpdated` / `folderDeleted` | A Folder is created, updated, or deleted |
| `spaceCreated` / `spaceUpdated` / `spaceDeleted` | A Space is created, updated, or deleted |

### Goal and Target events

| Event | Triggered When |
|-------|----------------|
| `goalCreated` / `goalUpdated` / `goalDeleted` | A Goal is created, updated, or deleted |
| `keyResultCreated` / `keyResultUpdated` / `keyResultDeleted` | A Target (key result) is created, updated, or deleted |

## How Should I Deduplicate ClickUp Events?

ClickUp recommends `{webhook_id}:{history_item_id}` as the idempotency key. Events without `history_items` (for example Goal events) need another key, such as `webhook_id` + `event` + resource ID.

## What Happens When My Endpoint Fails?

- A delivery fails if your endpoint returns a non-2xx status or takes longer than **7 seconds**
- ClickUp retries each event up to five times, then increments the webhook's `fail_count` and drops that event (failed events are not resent later)
- At `fail_count` 100 the webhook is **suspended**
- Returning **`401` or `410` suspends the webhook immediately**, so don't use `401` for signature failures
- Reactivate a suspended webhook with `PUT /api/v2/webhook/{webhook_id}` and `"status": "active"`

Respond quickly and move slow work to a queue.

## Full Event Reference

- [ClickUp Webhooks](https://developer.clickup.com/docs/webhooks)
- [Task webhook payloads](https://developer.clickup.com/docs/webhooktaskpayloads)
- [Webhook health status](https://developer.clickup.com/docs/webhookhealth)
