# Northpass Webhooks Overview

## What Are Northpass Webhooks?

Northpass (now Gainsight Customer Education) is a customer education LMS. Its Webhooks app
(Premium plan) sends an HTTP `POST` with a JSON body to your endpoint when learning events
happen in your school: learners are created, invited or activated, courses are published,
learners enroll, start and complete courses, activities and quizzes, register for ILT sessions,
and progress through learning paths.

Each request has an `X-Northpass-Hmac-SHA256` header (padded base64 HMAC-SHA256 of the raw body,
keyed with the school's shared secret). No header names the event type: read `data.type`.

## Common Event Types

| `data.type` | Triggered When | Common Use Cases |
|-------------|----------------|------------------|
| `learner_created_events` | A learner is created | Create the user in your CRM or app |
| `person_invited_events` | A person is invited | Track invitations |
| `person_activated_events` | A person activates their account | Mark the learner active |
| `learner_enrolled_to_course_events` | A learner is enrolled in a course | Record enrollments |
| `learner_started_course_events` | A learner starts a course | Progress tracking |
| `activity_completed_events` | A learner completes an activity | Fine-grained progress |
| `quiz_completed_events` | A learner completes a quiz | Store scores |
| `course_completed_events` | A learner completes a course | Issue credit, update the CRM |
| `course_published_events` | A course is published | Refresh your catalog |
| `learner_registered_to_ilt_session_events` | A learner registers for an ILT session | Sync session rosters |
| `learning_path_learner_enrolled_events` | A learner is enrolled in a learning path | Record enrollments |
| `learning_path_started_events` | A learner starts a learning path | Progress tracking |
| `learning_path_item_completed_events` | A learner completes a learning path item | Progress tracking |
| `learning_path_completed_events` | A learner completes a learning path | Issue credit |

The examples handle `learner_created_events`, `person_activated_events`,
`learner_enrolled_to_course_events`, `learner_started_course_events`, `course_completed_events`,
`quiz_completed_events` and `course_published_events`, and log the others.

## Event Payload Structure

The body is JSON:API style, wrapped in `data`:

```json
{
  "data": {
    "id": "66666666-6666-6666-6666-666666666666",
    "type": "course_completed_events",
    "links": {},
    "included": [
      { "id": "abcdefghi-1234-jklm-5678-nopqrstuvwxy", "type": "people",
        "attributes": { "email": "jillsmith@example.com", "full_name": "Jill Smith" } },
      { "id": "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzz", "type": "courses", "attributes": {} }
    ],
    "attributes": { "created_at": "2022-04-08T17:58:47Z", "course_version": 1, "course_attempt_number": 1 },
    "relationships": {
      "course": { "data": { "id": "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzz", "type": "courses" } },
      "person": { "data": { "id": "abcdefghi-1234-jklm-5678-nopqrstuvwxy", "type": "people" } }
    }
  }
}
```

- `data.type` is the event name (always ending in `_events`); `data.id` is the event id.
- `data.included` holds the related people, courses, activities or quizzes (not on every event;
  `course_published_events` has only `relationships`).
- `data.attributes` is event specific, for example `value` and `minimum_passing_score` on
  `quiz_completed_events`, or `version_number` on `course_published_events`.

Some documented example payloads do not match the subscription list exactly, so log and
acknowledge unknown `data.type` values instead of failing.

## Delivery and Retries

A failed delivery is retried every hour for 24 hours. If it still fails, **all** of the school's
webhooks are disabled and the admin is notified. Failed messages can be listed with the List all
sent webhooks endpoint. Respond with a 2xx quickly and process asynchronously.

## Full Event Reference

See [Northpass's webhook documentation](https://developers.northpass.com/docs/getting-started-webhooks).
