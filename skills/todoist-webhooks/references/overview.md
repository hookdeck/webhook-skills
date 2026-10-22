# Todoist Webhooks Overview

## What Are Todoist Webhooks?

Todoist webhooks send an HTTP POST to your app's callback URL in real time when subscribed events happen in a user's account. Webhooks belong to a Todoist **app** (App Management Console): once configured, you receive events for every user who has completed your app's OAuth flow. They are notifications, not a source of truth - deliveries can arrive delayed, out of order, or not at all, so re-fetch from the REST API when you need current state.

The callback URL must be HTTPS with no port.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `item:added` | A task is added | Sync new tasks to another tool |
| `item:updated` | A task is updated | Mirror edits; check `event_data_extra.update_intent` |
| `item:completed` | A task is completed | Trigger follow-up workflows |
| `item:uncompleted` | A task is reopened | Reverse completion side effects |
| `item:deleted` | A task is deleted | Remove mirrored records |
| `note:added` | A comment is added | Notify a team channel |
| `project:added` | A project is added | Provision resources |
| `project:archived` | A project is archived | Archive mirrored data |
| `reminder:fired` | A reminder fires | Push notifications |

Other events: `note:updated`, `note:deleted`, `project:updated`, `project:deleted`, `project:unarchived`, `section:added|updated|deleted|archived|unarchived`, `label:added|updated|deleted`, `filter:added|updated|deleted`.

## Event Payload Structure

```json
{
  "event_name": "item:added",
  "user_id": "2671355",
  "event_data": { "id": "6XR4GqQQCW6Gv9h4", "content": "Buy Milk", "project_id": "6XR4H993xv8H5qCR" },
  "initiator": { "id": "2671355", "email": "alice@example.com", "full_name": "Alice" },
  "triggered_at": "2025-02-10T10:39:38.000000Z",
  "version": "10"
}
```

- `user_id` - user the event is delivered for
- `event_data` - the affected object (Task, Comment, Project, ...)
- `initiator` - collaborator who caused the event (may differ from `user_id`)
- `version` - webhook version configured in the console
- `event_data_extra` - optional; `item:updated` may include `old_item` and `update_intent` (`item_updated`, `item_completed`, `item_uncompleted`)

## Headers

| Header | Purpose |
|--------|---------|
| `X-Todoist-Hmac-SHA256` | Base64 HMAC-SHA256 of the raw body, keyed with the app `client_secret` |
| `X-Todoist-Delivery-ID` | Unique per notification; identical on retries |
| `User-Agent` | `Todoist-Webhooks` |

## Delivery and Retries

Respond with HTTP 200. Any other response is a failed delivery; it is retried after 15 minutes, at most three times, with the same `X-Todoist-Delivery-ID`.

## Full Event Reference

See [Todoist Webhooks](https://developer.todoist.com/api/v1/#tag/Webhooks).
