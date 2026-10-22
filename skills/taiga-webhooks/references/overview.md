# Taiga Webhooks Overview

## What Are Taiga Webhooks?

Taiga is an open-source project management tool. Each project can have any number of webhooks. When a user story, task, issue, epic, sprint (milestone) or wiki page changes, Taiga sends a signed `POST` with a JSON body to each configured URL. Hosted Taiga may deliver asynchronously, so requests can arrive a few seconds late.

## Common Event Types

The event is identified by the body's `type` (the object) and `action` (what happened). There is no event-name header.

| Event (`type` `action`) | Triggered When | Common Use Cases |
|-------------------------|----------------|------------------|
| `userstory create` | A user story is created | Sync backlog items |
| `userstory change` | A user story is edited (status, points, assignee) | Status notifications |
| `userstory delete` | A user story is deleted | Remove mirrored records |
| `task create` / `task change` / `task delete` | Task lifecycle | Time tracking, chat alerts |
| `issue create` / `issue change` / `issue delete` | Issue lifecycle | Bug triage |
| `epic create` / `epic change` / `epic delete` | Epic lifecycle (sent by taiga-back; not on the docs page) | Roadmap sync |
| `milestone create` / `milestone change` / `milestone delete` | Sprint lifecycle | Sprint dashboards |
| `wikipage create` / `wikipage change` / `wikipage delete` | Wiki page lifecycle | Docs sync |
| `test test` | The "test" button on the webhook | Connectivity check |

## Event Payload Structure

```json
{
  "action": "change",
  "type": "userstory",
  "by": { "id": 6, "username": "user1", "full_name": "Purificacion Montero" },
  "date": "2016-04-12T12:00:56.335Z",
  "data": { "id": 139, "ref": 72, "subject": "test user story 5", "status": { "name": "New" } },
  "change": { "comment": "", "diff": {} }
}
```

- `action`: `create`, `change`, `delete` or `test`
- `type`: `userstory`, `task`, `issue`, `epic`, `milestone`, `wikipage` or `test`
- `by`: the user who caused the notification
- `date`: when the notification was generated
- `data`: the current object
- `change`: only present on `change` notifications (some `change` examples on the docs page also omit `date`)

Taiga sends no event ID, so deduplicate on `type` + `data.id` + `date` or make handlers idempotent.

## Full Event Reference

For payload examples per object, see [Taiga's webhook documentation](https://docs.taiga.io/webhooks.html).
