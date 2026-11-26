# LearnHouse Webhooks Overview

## What Are LearnHouse Webhooks?

LearnHouse pushes events to your application as they happen (a learner enrolls, completes a course, submits an assignment, signs up), so you can sync a CRM, send emails or update a dashboard without polling. Webhooks are a Pro feature, managed per organization under **Developers → Automations** in the dashboard, or through `/api/v1/orgs/{org_id}/webhooks` with a signed-in user session (API tokens are rejected).

Each delivery is a `POST` with a JSON body, signed with a per-endpoint secret. Any `2xx` response within the 10-second timeout succeeds; redirects are not followed. Otherwise LearnHouse makes up to 3 attempts, waiting 1 s then 4 s, with the same body and `delivery_id` each time, and logs the last 200 attempts per endpoint (`GET .../deliveries`). Delivery is at-least-once, so dedupe on `delivery_id`. Deliveries can arrive slightly out of order under load; LearnHouse says to use `timestamp` if you need strict ordering. Target URLs must be publicly reachable: `localhost` and private IPs are rejected.

## Request Headers

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |
| `X-Webhook-Event` | The event name, e.g. `course_completed` |
| `X-Webhook-Delivery` | Unique delivery id, e.g. `dlv_...` (use for idempotency) |
| `X-Webhook-Signature` | `sha256=<hex_digest>`: HMAC-SHA256 of the raw request body |
| `User-Agent` | `LearnHouse-Webhooks/1.0` |
| `Accept-Encoding` | `identity` |

## Event Payload Structure

```json
{
  "event": "course_completed",
  "delivery_id": "dlv_9f1e3c7b22a44f0d",
  "timestamp": "2026-04-19T14:31:02Z",
  "org_id": 1,
  "data": {
    "user": {
      "user_uuid": "user_abc",
      "email": "alice@example.com",
      "username": "alice"
    },
    "course": {
      "course_uuid": "course_xyz",
      "name": "Intro to Python"
    }
  }
}
```

The shape of `data` is event-specific. The [Event Catalogue](https://docs.learnhouse.app/platform/automations/events) prints each event's `data` schema, and `GET /api/v1/orgs/{org_id}/webhooks/events` returns the same registry from your instance.

## Event Types (46)

| Category | Events |
|----------|--------|
| System | `ping` |
| Learning progress | `course_completed`, `course_enrolled`, `activity_completed`, `assignment_submitted`, `assignment_graded`, `certificate_claimed`, `certificate_revoked`, `path_enrolled`, `path_completed` |
| User and access | `user_signed_up`, `user_email_verified`, `user_role_changed`, `user_invited_to_org`, `user_removed_from_org` |
| Course lifecycle | `course_created`, `course_published`, `course_deleted`, `course_update_published` |
| Content management | `activity_version_created`, `activity_version_restored`, `course_contributor_added`, `course_contributor_removed`, `folder_created`, `folder_updated`, `folder_deleted`, `podcast_episode_created` |
| Collaboration | `board_created`, `board_member_added`, `playground_created` |
| Community | `discussion_posted`, `comment_created`, `discussion_pinned`, `discussion_locked`, `discussion_vote_cast` |
| Groups | `usergroup_created`, `usergroup_deleted`, `usergroup_users_added`, `usergroup_resources_added` |
| Subscriptions | `pack_activated`, `pack_deactivated` |
| Organization | `org_signup_method_changed`, `org_ai_config_changed`, `org_payments_config_changed` |
| Payments | `payment_access_granted`, `payment_access_revoked` |

`collection_created` was in the earlier catalogue but is no longer documented.

The examples handle `ping`, `course_enrolled`, `course_completed`, `activity_completed`, `assignment_submitted`, `assignment_graded`, `certificate_claimed` and `user_signed_up`, and log the rest.

## Full Event Reference

See LearnHouse's [webhooks guide](https://docs.learnhouse.app/platform/automations/webhooks) and [Event Catalogue](https://docs.learnhouse.app/platform/automations/events).
