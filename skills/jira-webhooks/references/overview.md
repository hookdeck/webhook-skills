# Jira Webhooks Overview

## What Are Jira Webhooks?

Jira Cloud webhooks are HTTP POST callbacks that notify your application when
events happen in a Jira site — an issue is created, a comment is added, a worklog
is logged, and so on. Instead of polling the Jira REST API, you register a
webhook URL and Jira delivers a JSON payload to it as events occur.

Webhooks are registered either through the Jira administration UI or, for Connect
and OAuth 2.0 (3LO) apps, through the REST API (`POST /rest/api/3/webhook`), where
they are called **dynamic webhooks**. Only dynamic webhooks registered with a
`secret` are signed (see [verification.md](verification.md)).

## Common Event Types

Jira does **not** send an event-type header. The event name arrives in the JSON
body under the `webhookEvent` field.

| Event (`webhookEvent`) | Triggered When | Common Use Cases |
|------------------------|----------------|------------------|
| `jira:issue_created` | An issue is created | Sync to external systems, notify, auto-assign |
| `jira:issue_updated` | An issue is edited or transitioned | Track status changes, trigger automations |
| `jira:issue_deleted` | An issue is deleted | Clean up mirrored records |
| `comment_created` | A comment is added to an issue | ChatOps, notifications, sentiment analysis |
| `comment_updated` | A comment is edited | Audit trails, re-processing |
| `comment_deleted` | A comment is deleted | Audit trails |
| `worklog_created` | A worklog is logged on an issue | Time-tracking, billing integrations |

For the complete list (worklog, issue link, sprint, version, user, and more),
see the full event reference below.

## Event Payload Structure

All webhook payloads share a common envelope:

```json
{
  "timestamp": 1720000000000,
  "webhookEvent": "jira:issue_updated",
  "issue_event_type_name": "issue_generic",
  "user": {
    "accountId": "5b10a2...",
    "displayName": "Jane Developer"
  },
  "issue": {
    "id": "10002",
    "key": "PROJ-123",
    "fields": {
      "summary": "Login button is misaligned",
      "status": { "name": "In Progress" },
      "priority": { "name": "High" }
    }
  },
  "changelog": {
    "items": [
      { "field": "status", "fromString": "To Do", "toString": "In Progress" }
    ]
  }
}
```

Key fields:

- `webhookEvent` — the event type string; use this to dispatch (there is no header).
- `issue` — present on issue and comment events; `issue.key` is the human-readable key (e.g. `PROJ-123`).
- `comment` — present on `comment_*` events (`comment.body`, `comment.author.displayName`).
- `changelog` — present on `jira:issue_updated`; lists the fields that changed.
- `user` — the actor who triggered the event.
- `timestamp` — epoch milliseconds when the event occurred.

## Full Event Reference

For the complete list of events and payload schemas, see
[Jira's webhook documentation](https://developer.atlassian.com/cloud/jira/platform/webhooks/#events).
