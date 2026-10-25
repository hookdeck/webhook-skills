# Lessonly Webhooks Overview

## What Are Lessonly Webhooks?

Lessonly is a training and enablement platform, now part of Seismic and branded **Seismic
Learning**. The public API at https://docs.lessonly.com/ still uses the Lessonly name. Lessonly
can send an HTTP request to your server when a learner completes a lesson, so you can sync
completions to an HRIS, LMS report or CRM without polling.

The API reference describes a single webhook: the **lesson completed** callback. It is not
signed. The only credential is the optional `Authorization` header you configure (see
[verification.md](verification.md)). The docs say nothing about retries, ordering or an event
ID, so make handlers idempotent.

## What Webhook Events Does Lessonly Send?

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `lesson completed` | A learner completes a lesson | Record training completion, unlock access, update compliance reports |

There is no event-type field: every request to `lesson_completed_callback_url` is a lesson
completion. Path and other assignment events are not documented as webhooks.

## Payload

**The payload is not documented on Lessonly's API reference.** The body below is a clearly
**illustrative** lesson-completed example, used by this skill's examples and tests. Its field
names are assumptions; capture a real delivery before relying on them.

```json
{
  "lesson_id": 1234,
  "user_id": 5678,
  "completed_at": "2026-10-25T12:00:00Z"
}
```

Handlers in this skill therefore read fields defensively and only require the body to be a JSON
object.

## Deduplication

Without an event ID, dedupe on something stable in the real payload, such as the learner plus
lesson (and completion time if learners can retake lessons).

## Full Reference

See the Company Settings section of Lessonly's API documentation: https://docs.lessonly.com/
Seismic has said it is limiting Lessonly public API write endpoints for users, groups, lessons
and paths as customers move to the upgraded platform (see the Seismic Developer Portal,
https://developer.seismic.com). The company settings webhook endpoint is not listed among those.
