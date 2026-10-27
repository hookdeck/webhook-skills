# Coassemble Webhooks Overview

## What Are Coassemble Webhooks?

[Coassemble](https://coassemble.com) is a course-authoring and embedded-learning platform. Webhooks (Build plan and above) send server-to-server `POST` requests with a JSON body to your HTTPS endpoint when course and learner events happen: a course is created, a learner commences or completes a course, a standalone quiz is passed or failed, or a Classic migration batch progresses.

Typical uses: sync completions to an LMS or HRIS, issue certificates, update CRM records, trigger Slack or email notifications.

## Common Event Types

The event name is in the body's `type` field (and the `X-Coassemble-Event` header).

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `course.created` | A new course is created | Index new courses, notify admins |
| `course.commenced` | A learner first commences a course tracking record | Record enrolment, start timers |
| `course.completed` | A learner first completes a course tracking record | Issue certificates, update HR records |
| `quiz.completed` | A learner passes a standalone Screen Player quiz | Award credit, record scores |
| `quiz.failed` | A learner fails a standalone Screen Player quiz | Assign remedial content |
| `migration.progress` | One course in a Classic migration batch finishes (migrated, blocked or failed) | Show batch progress |
| `migration.completed` | A Classic migration batch reaches `completed` or `completed_with_errors` | Report batch results |

`migration.progress` and `migration.completed` fire only for HTTP 202 batches (two or more unique courses).

## Event Payload Structure

Every delivery shares this envelope:

```json
{
  "id": "17fd9df8-c77a-4b7d-a281-267b74f8cbf3",
  "type": "course.completed",
  "occurredAt": "2026-02-22T10:15:30.000Z",
  "workspaceId": 1234,
  "testMode": false,
  "data": {
    "course": { "id": 4321, "title": "Security Basics", "key": "security-basics", "clientIdentifier": "course_abc" },
    "collection": { "id": 42, "key": "onboarding-path" },
    "tracking": {
      "id": 8888, "identifier": "user_123", "email": "user@example.com",
      "commenced": "2026-02-22T10:01:00.000Z", "completed": "2026-02-22T10:15:30.000Z", "totalTime": 870
    }
  }
}
```

- `course.commenced` and `course.completed` include `data.collection` (`{ id, key }`) only when the tracking was taken inside a collection.
- `migration.*`: `data` matches `GET /v1/headless/course-migrations/{id}` (`id`, `status`, `created`, `completed`, `counts`, `items`). `migration.progress` also includes the finished course as `data.item`.
- `testMode: true` marks test deliveries (sandbox keys and the dashboard's test button, which also adds `data.test: true`). They are signed and delivered normally, so route them away from production actions. Deliveries queued before the field existed may omit it.

## Request Headers

| Header | Description |
|--------|-------------|
| `X-Coassemble-Signature` | `sha256=<hex>` HMAC-SHA256 signature |
| `X-Coassemble-Timestamp` | Unix timestamp (seconds) used for signature verification |
| `X-Coassemble-Event` | Event name, e.g. `course.completed` |
| `X-Coassemble-Delivery` | Unique delivery ID (UUID); use it for idempotency |
| `X-Coassemble-Test-Mode` | `true` or `false`, matching the body's `testMode` |

## Delivery and Retries

- A delivery succeeds only on a `2xx`; the request timeout is 10 seconds.
- Up to 6 attempts (the first delivery plus five retries) after roughly 1 minute, 5 minutes, 30 minutes, 2 hours and 6 hours, about 8.5 hours in all. Deliveries that were already pending when the schedule changed keep 4 attempts.
- Retries and manual replays keep the same `X-Coassemble-Delivery` ID and the original payload and `testMode`. Manual replay remains available after automatic retries stop.
- Respond with a `2xx` quickly and process asynchronously.

## Full Event Reference

See [Coassemble's webhook documentation](https://developers.coassemble.com/webhooks).
