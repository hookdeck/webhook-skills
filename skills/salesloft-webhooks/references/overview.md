# Salesloft Webhooks Overview

## What Are Salesloft Webhooks?

Salesloft webhooks notify you about changes to your Salesloft data. When a subscribed event fires, Salesloft sends an HTTP POST to the subscription's configured URL. Subscriptions are made on behalf of a team and are created only through the Webhook Subscriptions API (`POST /v2/webhook_subscriptions`) with a valid OAuth token or API key; there is no dashboard UI for this.

Each delivery carries two special headers:

| Header | Description |
|--------|-------------|
| `x-salesloft-event` | Name of the event type that triggered the delivery |
| `x-salesloft-signature` | HMAC-SHA1 hex digest of the body, keyed with the subscription's `callback_token` |

## Common Event Types

| Event | Triggered When | Required scope |
|-------|----------------|----------------|
| `person_created` | A person is created (receives the new person object) | `people:read` |
| `person_updated` | A person is updated | `people:read` |
| `person_deleted` | A person is deleted | `people:read` |
| `call_created` | A call is created | `calls:read` |
| `call_updated` | A call is updated | `calls:read` |
| `email_updated` | An email object is updated | `emails:read` |
| `meeting_booked` | A meeting is created | `meetings:read` |
| `meeting_updated` | A meeting is updated | `meetings:read` |
| `cadence_membership_created` | A cadence membership is created | `cadences:read` |
| `cadence_membership_updated` | A cadence membership is updated | `cadences:read` |
| `task_created` / `task_updated` / `task_completed` / `task_deleted` | Task lifecycle | `tasks:read` |
| `note_created` / `note_updated` / `note_deleted` | Note lifecycle | `notes:read` |

The full list on Salesloft's Event Types page also includes `account_created`, `account_updated`, `account_deleted`, `bulk_job_completed`, `cadence_created`, `cadence_updated`, `cadence_deleted`, `call_data_record_created`, `call_data_record_updated`, `conversation_created`, `conversation_recording_created`, `conversation_transcript_created`, `email_with_body_and_subject_updated`, `link_swap`, `step_created`, `step_updated`, `step_deleted`, `success_created`, `user_created`, and `user_updated`.

Subscribe with the exact string as the `event_type`. The authorized user also needs the matching permissions, or the data won't be included.

## Event Payload Structure

The body is JSON containing the resource object named in the event description (for example the new person for `person_created`). Dispatch on the `x-salesloft-event` header, and treat field names as per the Salesloft API reference for that resource. The `callback_token` is also echoed in the payload; use the signature header for authentication.

## Retries

A failing webhook is retried three additional times, 15 seconds apart, before being marked as failed. Return a 2xx quickly and make handlers idempotent, since a retry may repeat a delivery.

## Full Event Reference

See [Salesloft's webhook documentation](https://developers.salesloft.com/docs/platform/webhooks/introduction/) and the [Event Types page](https://developers.salesloft.com/docs/platform/webhooks/event-types/).
