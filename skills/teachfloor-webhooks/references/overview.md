# Teachfloor Webhooks Overview

## What Are Teachfloor Webhooks?

Teachfloor sends an HTTP `POST` with a JSON body to each endpoint you register whenever a
selected event happens: a course is created, a member joins or completes a course, an element
is completed, a member logs in. An outside system can react without polling the API.

## Event Envelope

Every event has the same four top-level fields:

| Field | Meaning |
|-------|---------|
| `id` | Event ID (for example `evt_abc123`). Use it to deduplicate |
| `type` | Event type, for example `course.join`. **Dispatch on this** |
| `created_at` | ISO 8601 timestamp |
| `data` | The object the event is about; its shape depends on `type` |

## Event Types

| `type` | Triggered When | Common Use Cases |
|--------|----------------|------------------|
| `course.created` | A course is created | Sync a course catalog |
| `course.updated` | A course is updated | Refresh cached course data |
| `course.completed` | A member completes a course | Issue credentials, notify the learner |
| `course.join` | A member joins a course | Provision access, CRM enrollment |
| `module.created` | A module is created | Sync course structure |
| `module.updated` | A module is updated | Sync course structure |
| `element.created` | An element is created | Sync course content |
| `element.updated` | An element is updated | Sync course content |
| `element.deleted` | An element is deleted | Remove synced content |
| `element.completed` | A member completes an element | Progress tracking |
| `member.login` | A member logs in | Activity tracking |

## Example Payloads

`course.join` (`data` is a course membership with nested `member` and `course` objects):

```json
{
  "id": "evt_abc123",
  "type": "course.join",
  "created_at": "2025-10-07T15:30:00.000000Z",
  "data": {
    "id": "cm_xyz789",
    "object": "course_member",
    "joined_at": "2025-10-07T15:30:00.000000Z",
    "member": { "id": "usr_123", "object": "member", "full_name": "John Doe", "email": "john@example.com" },
    "course": { "id": "crs_456", "object": "course", "name": "Introduction to Development", "status": "published" }
  }
}
```

`element.completed` (`data` is an activity with `member` and a `context` element):

```json
{
  "id": "evt_def456",
  "type": "element.completed",
  "created_at": "2025-10-07T15:30:00.000000Z",
  "data": {
    "id": "act_789",
    "object": "activity",
    "status": "completed",
    "passed": true,
    "score": 95,
    "member": { "id": "usr_123", "object": "member", "email": "john@example.com" },
    "context": { "id": "elm_321", "object": "element", "name": "Introduction Video", "type": "video", "module": "mod_654" }
  }
}
```

Payloads are abridged here; see Teachfloor's event reference for every field.

## Delivery and Retries

Respond with a `2xx` within 10 seconds. Teachfloor makes 3 attempts in total (the first delivery
plus 2 retries), waiting 10 seconds and then 100 seconds. Because the same event can arrive more
than once, make your handler idempotent on the event `id`.

## Request Headers

| Header | Purpose |
|--------|---------|
| `teachfloor-signature` | Hex HMAC-SHA256 of the raw body (see [verification.md](verification.md)) |

## Full Event Reference

See Teachfloor's [webhook documentation](https://docs.teachfloor.com/docs/webhooks/security).
