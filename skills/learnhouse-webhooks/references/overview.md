# LearnHouse Webhooks Overview

## What Are LearnHouse Webhooks?

LearnHouse pushes events to your application as they happen (a learner enrolls, completes a course, submits an assignment, signs up), so you can sync a CRM, send emails or update a dashboard without polling. Webhooks are a Pro feature, managed per organization in settings or through `/api/v1/orgs/{org_id}/webhooks`.

Each delivery is a `POST` with a JSON body, signed with a per-endpoint secret. Any `2xx` response succeeds. Otherwise LearnHouse makes up to 3 attempts, waiting 1 s then 4 s, and logs every delivery (`GET .../deliveries`). Delivery is at-least-once, so dedupe on `delivery_id`. Target URLs must be publicly reachable: `localhost` and private IPs are rejected.

## Request Headers

| Header | Value |
|--------|-------|
| `X-Webhook-Event` | The event name, e.g. `course_completed` |
| `X-Webhook-Delivery` | Unique delivery id, e.g. `dlv_...` (use for idempotency) |
| `X-Webhook-Signature` | `sha256=<hmac-hex>`: HMAC-SHA256 of the raw request body |
| `User-Agent` | `LearnHouse-Webhooks/1.0` |

## Event Payload Structure

```json
{
  "event": "course_completed",
  "delivery_id": "dlv_1a2b3c4d5e6f7081",
  "timestamp": "2026-06-22T12:00:00Z",
  "org_id": 1,
  "data": {
    "user": { "user_uuid": "user_…", "email": "learner@example.com", "username": "learner" },
    "course": { "course_uuid": "course_…", "name": "Introduction to Python" }
  }
}
```

The shape of `data` is event-specific. `GET /api/v1/orgs/{org_id}/webhooks/events` returns each event's payload schema.

## Event Types (39)

| Category | Events |
|----------|--------|
| System | `ping` |
| Learning progress | `course_completed`, `course_enrolled`, `activity_completed`, `assignment_submitted`, `assignment_graded`, `certificate_claimed` |
| User and access | `user_signed_up`, `user_email_verified`, `user_role_changed`, `user_invited_to_org`, `user_removed_from_org` |
| Course lifecycle | `course_created`, `course_published`, `course_deleted`, `course_update_published` |
| Content management | `activity_version_created`, `activity_version_restored`, `course_contributor_added`, `course_contributor_removed`, `collection_created`, `podcast_episode_created` |
| Collaboration | `board_created`, `board_member_added`, `playground_created` |
| Community | `discussion_posted`, `comment_created`, `discussion_pinned`, `discussion_locked`, `discussion_vote_cast` |
| Groups | `usergroup_created`, `usergroup_deleted`, `usergroup_users_added`, `usergroup_resources_added` |
| Subscriptions | `pack_activated`, `pack_deactivated` |
| Organization | `org_signup_method_changed`, `org_ai_config_changed`, `org_payments_config_changed` |

The examples handle `ping`, `course_enrolled`, `course_completed`, `activity_completed`, `assignment_submitted`, `assignment_graded`, `certificate_claimed` and `user_signed_up`, and log the rest.

## Full Event Reference

See [LearnHouse's webhook documentation](https://docs.learnhouse.app/guides/custom-features/webhooks).
