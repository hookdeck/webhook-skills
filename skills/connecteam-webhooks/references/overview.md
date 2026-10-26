# Connecteam Webhooks Overview

## What Are Connecteam Webhooks?

Connecteam is a frontline workforce app. Webhooks created through the Connecteam Webhook API push a JSON request to your `url` when an event happens in one of six features: users, forms, time activity (the time clock), the shift scheduler, tasks and chat. Each webhook subscribes to a list of `eventTypes`.

Webhooks are unsigned. If you set a `secretKey`, Connecteam sends that exact value in the `x-webhook-secret` header. Without a `secretKey` there is nothing to verify.

## Common Event Types

| Event | Feature | Triggered When |
|-------|---------|----------------|
| `user_created` | Users | A new user is added |
| `user_updated` | Users | A user profile changes |
| `user_deleted` | Users | A user is permanently deleted |
| `user_archived` | Users | A user is archived |
| `user_restored` | Users | A user is unarchived |
| `user_promoted` | Users | A user is promoted to admin |
| `user_demoted` | Users | An admin is demoted to user |
| `form_submission` | Forms | A new form is submitted |
| `form_submission_edited` | Forms | A submission is edited |
| `manager_field_updated` | Forms | Manager fields are updated |
| `clock_in` | Time Activity | A user clocks in |
| `clock_out` | Time Activity | A user clocks out |
| `auto_clock_out` | Time Activity | Automatic clock out |
| `admin_add` | Time Activity | An admin adds a time entry |
| `admin_edit` | Time Activity | An admin edits a time entry |
| `admin_delete` | Time Activity | An admin deletes a time entry |
| `user_timesheet_submitted` | Time Activity | A timesheet is submitted |
| `user_timesheet_unsubmitted` | Time Activity | A timesheet is unsubmitted |
| `user_timesheet_approved` | Time Activity | A timesheet is approved |
| `user_timesheet_reopened` | Time Activity | A timesheet is reopened |
| `shift_created` | Shift Scheduler | A shift is created |
| `shift_updated` | Shift Scheduler | A shift is updated |
| `shift_deleted` | Shift Scheduler | A shift is deleted |
| `availability_status_created` | Shift Scheduler | An availability status is created |
| `availability_status_deleted` | Shift Scheduler | An availability status is deleted |
| `task_published` | Tasks | A task is published |
| `task_completed` | Tasks | A task is completed |
| `message_created` | Chat | A message is sent |
| `message_updated` | Chat | A message is edited |
| `message_deleted` | Chat | A message is deleted |
| `conversation_created` | Chat | A conversation is created |
| `conversation_updated` | Chat | A conversation is updated |
| `conversation_deleted` | Chat | A conversation is deleted |

Time Activity also sends request events (for example `user_add_request`, `admin_approved_add_request`, `admin_declined_edit_request`, `auto_approved_delete_request`) and day-lock events (`admin_day_locked`, `admin_day_unlocked`). The handlers in `examples/` log any event they don't list.

## Event Payload Structure

Most features send an envelope:

```json
{
  "requestId": "ba973227-6f19-4e5f-8847-875147a05cb9",
  "company": "your_company_id",
  "activityType": "User",
  "eventTimestamp": 1731595939,
  "eventType": "user_created",
  "data": [{ "userId": 9063791, "email": "john@example.com", "isArchived": false }]
}
```

`data` is an array for users and an object for forms, tasks and chat. Shift Scheduler payloads add `webhookVersion` and `schedulerId`. Time Activity payloads are flat: `userId`, `timeClockId` and the event's fields sit at the root next to `webhookVersion`.

```json
{
  "requestId": "550e8400-e29b-41d4-a716-446655440011",
  "company": "123456",
  "activityType": "timesheet_period",
  "eventTimestamp": 1786878000,
  "eventType": "user_timesheet_approved",
  "userId": 145,
  "timeClockId": 67,
  "webhookVersion": 1
}
```

## Delivery

Return any 2xx within 10 seconds, then process the event asynchronously. A 404 is treated as permanent; other failures may be retried.

## Full Event Reference

See [Connecteam's webhook documentation](https://developer.connecteam.com/docs/setting-up-webhook-via-api) for the complete list and per-feature guides.
