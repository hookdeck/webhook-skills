# Lessonly Webhooks Overview

## What Are Lessonly Webhooks?

Lessonly is a training and enablement platform, now part of Seismic and branded **Seismic
Learning**. The public API at https://docs.lessonly.com/ still uses the Lessonly name. Lessonly
can send an HTTP request to your server when a learner completes a lesson, so you can sync
completions to an HRIS, LMS report or CRM without polling.

The API reference describes a single webhook: the **lesson completed** callback, which
Lessonly's help center calls the **reporting webhook**. It is not signed. The only credential
is the optional `Authorization` header you configure (see [verification.md](verification.md)).
A failed `POST` is retried up to three times, every five minutes, and after 3 failures in 15
minutes Lessonly stops retrying "until new data is available to POST". There is no event ID
and ordering isn't documented, so make handlers idempotent.

## What Webhook Events Does Lessonly Send?

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `lesson completed` | A learner completes a lesson | Record training completion, unlock access, update compliance reports |

There is no event-type field: every request to `lesson_completed_callback_url` is a lesson
completion. Lessonly also has a separate **user action webhook** (user-created, user-updated,
user-archived, user-restored), set up as a subscription with a basic-auth token; its payload
isn't documented and this skill doesn't cover it.

## Payload

Lessonly's [Reporting Webhook](https://intercom.help/lessonly/en/articles/3828587-reporting-webhook)
article documents the body as JSON and prints this sample (as an image; the learner's name and
email are placeholders here):

```json
{
  "user": {
    "id": "1234567890",
    "name": "Example Learner",
    "email": "learner@example.com",
    "custom_fields": {
      "Favorite Color": "Orange",
      "Custom Field 2": "Custom Field 2 Contents"
    }
  },
  "lesson": {
    "id": "1234567",
    "title": "A Sample Lesson",
    "retake_score": 85
  },
  "score": 1,
  "score_percent": 100,
  "started_at": "2022-12-02T15:13:22Z",
  "completed_at": "2022-12-02T15:13:26Z",
  "via_path_id": "7654321",
  "assigned_at": "2022-12-02T15:13:17Z",
  "report_card_url": "https://customer.lessonly.com/path/7654321-a-sample-path/lesson/1234567-a-sample-lesson/report"
}
```

The article's field list also names `ext_uid` on the user when your company uses external user
IDs. Handlers in this skill read fields defensively and only require the body to be a JSON
object.

## Deduplication

Without an event ID, dedupe on `user.id`, `lesson.id` and `completed_at`. Learners can retake
lessons, so the learner and lesson alone would drop a real second completion.

## Full Reference

See the Company Settings section of Lessonly's API documentation: https://docs.lessonly.com/
and the Reporting Webhook article: https://intercom.help/lessonly/en/articles/3828587-reporting-webhook
Seismic has said it is limiting Lessonly public API write endpoints for users, groups, lessons
and paths as customers move to the upgraded platform (see the Seismic Developer Portal,
https://developer.seismic.com). The company settings webhook endpoint is not listed among those.
