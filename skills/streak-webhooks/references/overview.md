# Streak Webhooks Overview

## What Are Streak Webhooks?

Streak is a CRM that runs inside Gmail. A webhook makes Streak POST the updated object(s) to a
URL you choose when a pipeline or team event happens, such as a box being created or changing
stage. Updated objects arrive in a JSON array.

Each webhook is created through the API (`POST /api/v2/webhooks`) for **one event** on **one
pipeline or team**. Streak does not sign requests. The optional `token` you set at creation is
sent as plain text in the `X-Streak-Webhook-Token` header; a webhook created without a token
sends no credential at all.

## Event Types

The event decides the type of object sent. The body may not name the event, so use one URL (or
query parameter) per webhook.

| Event | Category | Object | Triggered When |
|-------|----------|--------|----------------|
| `BOX_CREATE` | Pipeline | Box | A new box is created |
| `BOX_DELETE` | Pipeline | Box | A box is deleted |
| `STAGE_CREATE` | Pipeline | Stage | A new stage is created |
| `BOX_NEW_EMAIL_ADDRESS` | Pipeline | Box | A new email address is detected on a box |
| `BOX_EDIT` | Pipeline | Box | A custom field, notes, assigned to, or name is edited on a box |
| `BOX_CHANGE_STAGE` | Pipeline | Box | A box changes stage |
| `BOX_CHANGE_PIPELINE` | Pipeline | Box | A box changes pipeline |
| `COMMENT_CREATE` | Pipeline | Comment | A comment is created |
| `MEETING_CREATE` | Pipeline | Meeting note/Call log | A meeting note or call log is created in a box |
| `MEETING_UPDATE` | Pipeline | Meeting note/Call log | A meeting note or call log is changed |
| `TASK_CREATE` | Pipeline | Task | A task is created |
| `TASK_COMPLETE` | Pipeline | Task | A task is complete |
| `TASK_DUE` | Pipeline | Task | A task is due |
| `TASK_UPDATED` | Pipeline | Task | Anything about a task changes (text, due date, status, assigned to, etc.) |
| `CONTACT_CREATE` | Team | Contact | A contact is created |
| `CONTACT_UPDATE` | Team | Contact | A contact is updated |
| `CONTACT_DELETE` | Team | Contact | A contact is deleted |
| `ORG_CREATE` | Team | Organization | An organization is created |
| `ORG_UPDATE` | Team | Organization | An organization is updated |
| `ORG_DELETE` | Team | Organization | An organization is deleted |

## Payload Structure

The body is the updated object(s) in an array (Box, Stage, Comment, Meeting note/Call log, Task,
Contact or Organization, depending on the event). The examples also accept a single object. Box
objects carry keys such as `key`, `pipelineKey` and `stageKey`; check the Streak API reference
for each object type.

## Delivery and Retries

- Respond `200` to acknowledge.
- Respond `410 Gone` and Streak **deletes the webhook**. Never return it by accident.
- Any other response is retried with a backoff delay, so handlers should be idempotent.

## Full Event Reference

See [Streak's webhook documentation](https://streak.readme.io/reference/webhooks) and
[Create a webhook](https://streak.readme.io/reference/create-a-webhook).
