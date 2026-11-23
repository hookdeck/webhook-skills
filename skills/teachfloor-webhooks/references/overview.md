# Teachfloor Webhooks Overview

## What Are Teachfloor Webhooks?

Teachfloor sends an HTTP `POST` with a JSON body to each endpoint you register whenever a
selected event happens: a member joins the organization or a course, finishes an element or a
course, logs in, or course content changes. An outside system can react without polling the API.
Events fire for changes made in the dashboard, through the Public API, by automations and by the
platform itself, including writes your own integration makes.

## Event Envelope

Every event has the same top-level fields:

| Field | Meaning |
|-------|---------|
| `id` | Delivery ID (a random string such as `WqX3nKp7Lm2vRt9Z`), stable across retries and equal to the `Teachfloor-Idempotency-Key` header. Use it to deduplicate |
| `type` | Event type, for example `course.join`. **Dispatch on this** |
| `created_at` | ISO 8601 timestamp of when the event was recorded |
| `installation_id` | Only on deliveries to an extension app's endpoint: the installation the event belongs to |
| `data` | The object the event is about. Its `object` field names the shape (`course`, `module`, `element`, `member`, `course_member`, `organization_member`, `activity`) |

Every `*.updated` event carries the full current object plus `data.previous_attributes`, holding
only the keys that changed and their old values. Enumerated values (`status`, `availability`,
`visibility`, element `type`) are upper-case, as the Public API returns them.

## Event Types

| `type` | Triggered When | Common Use Cases |
|--------|----------------|------------------|
| `organization.join` | A member joins the organization (`data` is the membership) | Provision an account |
| `member.created` | A member joins the organization (`data` is the member) | Provision an account |
| `member.updated` | A member's name, avatar, email or organization-level custom fields change | Sync a CRM contact |
| `member.revoked` | A member is removed from the organization | Revoke access |
| `member.login` | A member logs in | Activity tracking |
| `course.created` | A course is created | Sync a course catalog |
| `course.updated` | A course is updated | Refresh cached course data |
| `course.join` | A member joins a course | Provision access, CRM enrollment |
| `course.completed` | A member completes a course | Issue credentials, notify the learner |
| `module.created` | A module is created | Sync course structure |
| `module.updated` | A module is updated | Sync course structure |
| `element.created` | An element is created | Sync course content |
| `element.updated` | An element is updated | Sync course content |
| `element.deleted` | An element is deleted | Remove synced content |
| `element.completed` | A member completes an element | Progress tracking |
| `xapi.statement.created` | An xAPI statement is recorded | Forward to a Learning Record Store |
| `app.installed` / `app.uninstalled` | An organization installs or uninstalls your extension app (extension app endpoints only) | Provision or clean up tenant state |

## Example Payloads

`course.join` (`data` is a course membership with nested `member` and `course` objects):

```json
{
  "id": "WqX3nKp7Lm2vRt9Z",
  "type": "course.join",
  "created_at": "2026-10-07T15:30:00.000000Z",
  "data": {
    "id": "Vzo2KDjObalAXmMa",
    "object": "course_member",
    "joined_at": "2026-10-07T15:30:00.000000Z",
    "member": { "id": "e7W6kP8wvjd3GRBz", "object": "member", "full_name": "John Doe", "email": "john@example.com" },
    "course": { "id": "p5v87ERWKR3dkjyD", "object": "course", "name": "Introduction to Development", "status": "PUBLISHED" },
    "custom_fields": { "field_12": "Vegetarian" },
    "tags": ["vip", "beta-cohort"]
  }
}
```

`element.completed` (`data` is an activity with `member` and a `context` element; group work
sends a `members` array instead of `member`):

```json
{
  "id": "Hs8dFk2mNp4qTv6Y",
  "type": "element.completed",
  "created_at": "2026-10-07T15:30:00.000000Z",
  "data": {
    "id": "B4peAvmZ1L9OY3Xr",
    "object": "activity",
    "status": "COMPLETED",
    "passed": true,
    "score": 95,
    "completed_by": "e7W6kP8wvjd3GRBz",
    "member": { "id": "e7W6kP8wvjd3GRBz", "object": "member", "email": "john@example.com" },
    "context": { "id": "QB8nmEJjqdbLA2K5", "object": "element", "name": "Final quiz", "type": "QUIZ", "module": "no0aApWNyRMD68rv" }
  }
}
```

`member.login` is a small activity: `data.member` is the member's ID as a string, with
`logged_in_at`.

Payloads are abridged here; see Teachfloor's event reference for every field.

## Delivery and Retries

Respond with a `2xx` within 10 seconds. Teachfloor makes 3 attempts in total (the first delivery
plus 2 retries), waiting 10 seconds and then 100 seconds. Because the same event can arrive more
than once, make your handler idempotent on the event `id` (or the `Teachfloor-Idempotency-Key`
header, which carries the same value). Teachfloor's extension app docs say events can arrive out
of order when one needs several attempts, and to compare `created_at` if order matters.

## Request Headers

| Header | Purpose |
|--------|---------|
| `teachfloor-signature` | Hex HMAC-SHA256 of the raw body (see [verification.md](verification.md)) |
| `teachfloor-idempotency-key` | Equals the envelope `id`; stable across retries |

## Full Event Reference

See Teachfloor's [event reference](https://docs.teachfloor.com/docs/webhooks/event-reference).
