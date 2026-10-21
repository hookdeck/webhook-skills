# Fillout Webhooks Overview

## What Are Fillout Webhooks?

Fillout is a form builder for forms, surveys, quizzes and scheduling pages. A webhook is
one of a form's integrations: when a respondent submits the form, Fillout sends the
submission to your URL in real time. You add it under **Integrate → Webhook** in the form
editor, or with the REST API (`POST /v1/api/webhook/create`).

Fillout webhooks are **not signed**. Authentication is a custom header you configure,
typically `Authorization: Bearer <secret_token>`. See [verification.md](verification.md).

## What Events Does Fillout Send?

There is one trigger and no event type field in the payload.

| Trigger | Fires when | Common use cases |
|---------|-----------|------------------|
| Form submission | A respondent submits the form | Save leads to a CRM or database, send notifications, start onboarding, sync bookings |

Things that don't fire the form webhook:

- **Partial submissions.** The webhook runs on submit.
- **Scheduling cancellations and reschedules.** A webhook added under Integrate only runs
  for the original booking. Fillout's docs say to use a **workflow** for cancel and
  reschedule.

Things that send the **same submission again**:

- **Retry integration** on the form's Results page after a failed delivery.
- **Resubmitting** a response, which reruns every integration, workflow and notification
  on the form.
- **Editing** a submission, which can rerun integrations.

So deduplicate on `submissionId` (plus `lastUpdatedAt` if you want edits to go through).

## What's in the Payload?

### Simple mode (default)

Fillout's docs: *"By default, Fillout sends the full submission to your webhook URL as
JSON."* Not included: browser, operating system, network ID, and the edit-submission link
(fetch that from the REST API with `includeEditLink=true`).

For webhooks created through the API, Fillout's docs say the webhook receives
*"submissions in the same format as the entries in the `responses` list from the
`/submissions` endpoint."* That submission object:

| Field | Type | Notes |
|-------|------|-------|
| `submissionId` | string | Unique ID, e.g. `6bcedd3a-fe26-4bcb-9ce9-d3850e38d42c`. Required |
| `submissionTime` | ISO 8601 string | When the form was submitted. Required |
| `lastUpdatedAt` | ISO 8601 string | Changes when the submission is edited |
| `questions` | array | `{ id, name, type, value }` per question. Required |
| `calculations` | array | `{ id, name, type, value }`, where `type` is `number`, `text` or `duration` |
| `urlParameters` | array | `{ id, name, value }`, for hidden fields and UTM parameters |
| `scheduling` | array | `{ id, name, value }`, where `value` holds the booking (see below) |
| `payments` | array | `{ id, name, value }`, where `value` holds the Stripe payment details |
| `quiz` | object | `{ score, maxScore }` on quiz forms |
| `login` | object | `{ email }` when the form uses a login page |

Example (illustrative values, documented field names):

```json
{
  "submissionId": "6bcedd3a-fe26-4bcb-9ce9-d3850e38d42c",
  "submissionTime": "2026-10-21T10:15:30.000Z",
  "lastUpdatedAt": "2026-10-21T10:15:30.000Z",
  "questions": [
    { "id": "nameQ", "name": "What's your name?", "type": "ShortAnswer", "value": "Ada Lovelace" },
    { "id": "emailQ", "name": "What's your email?", "type": "EmailInput", "value": "ada@example.com" }
  ],
  "calculations": [
    { "id": "total", "name": "Total", "type": "number", "value": "42" }
  ],
  "urlParameters": [
    { "id": "utm_source", "name": "utm_source", "value": "newsletter" }
  ],
  "quiz": { "score": 3, "maxScore": 5 }
}
```

`questions` is an array, not a map. Look answers up by `id` (stable) rather than `name`
(the question text, which changes when someone edits the form). `value` can be a string,
number, array or object depending on the question type.

The help center doesn't print a sample of the dashboard webhook's JSON, so the examples
accept the submission either at the top level or wrapped as `{ "submission": { ... } }`.

### Scheduling forms

Fillout's docs list the fields a scheduling form's webhook sends by default: `fullName`,
`email`, `phone` (if available), `timezone`, `eventStartTime`, `eventEndTime`, `eventId`,
`eventUrl`, `rescheduleOrCancelUrl`, `scheduledUserEmail` and `scheduledUserName`. Start
and end times are always UTC. The Zoom link isn't included unless you switch to Advanced
and map it.

In the submission object these appear inside `scheduling[].value`.

### Advanced mode

Switching the webhook from **Simple** to **Advanced** changes the payload completely:
*"In Advanced, Fillout no longer sends the full submission. You map the data yourself in
the Body section."* The body is still JSON, but the keys are whatever you mapped. Advanced
mode also lets you choose the HTTP method (`POST` or `GET`), add URL parameters, headers
and cookies.

The **Headers** section is part of Advanced mode, so a webhook authenticated with an
`Authorization` header sends a mapped body, not the full submission. Map at least:

| Body key | Value in Fillout |
|----------|------------------|
| `submissionId` | Submission ID (for deduplication) |
| `submissionTime` | Submission time / date utility (optional) |
| one key per answer you need | the form field |

Example mapped body:

```json
{
  "submissionId": "6bcedd3a-fe26-4bcb-9ce9-d3850e38d42c",
  "name": "Ada Lovelace",
  "email": "ada@example.com"
}
```

The examples treat any body without a `questions` array as a mapped body and read its
keys directly.

## Full Reference

- Webhook help article: https://www.fillout.com/help/webhook
- Submission schema: https://www.fillout.com/help/api-reference/get-submission-by-id
- Create a webhook (API): https://www.fillout.com/help/api-reference/create-a-webhook
