# JobAdder Webhooks Overview

## What Are JobAdder Webhooks?

JobAdder is a recruitment CRM. Its API supports webhooks for event notification: when an event
occurs, JobAdder issues an HTTP POST with a JSON body to the URL you registered on a webhook.
Webhooks are created through the Webhook API (`POST /webhooks`), which needs a partner
application and the `offline_access` scope.

Notifications are **not signed**. The only credential is the optional `authorization` value you
set on the webhook, which JobAdder sends back as the `Authorization` header (see
[verification.md](verification.md)).

The docs state that "the order of webhook notifications are not guaranteed, and idempotency may
lead to duplicate notifications", so dedupe on `eventId` and don't rely on ordering.

## What Events Does JobAdder Send?

The body names the event in `event`. Commonly handled events:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `candidate_status_changed` | A candidate's status changes | Sync candidate pipeline state |
| `job_status_changed` | A job's status changes | Mirror open/closed jobs |
| `jobapplication_status_changed` | A job application moves to a new status | Drive screening and interview workflows |
| `placement_approved` | A placement is approved | Onboarding, invoicing, payroll handoff |
| `placement_status_changed` | A placement's status changes | Track placements |
| `interview_scheduled` | An interview is scheduled | Calendar sync |
| `candidate_updated` | A candidate record is updated | Keep a CRM copy current |

The example handlers act on the first four; everything else logs as unhandled.

All event names in the API's `EventName` list: `job_status_changed`, `job_invoice_sent`,
`job_partner_action`, `jobad_posted`, `jobad_expired`, `jobad_partner_action`,
`candidate_status_changed`, `candidate_partner_action`, `candidate_updated`,
`candidate_skill_updated`, `jobapplication_status_changed`, `jobapplication_partner_action`,
`placement_approved`, `placement_status_changed`, `placement_partner_action`,
`company_status_changed`, `company_updated`, `company_address_updated`, `company_partner_action`,
`contact_status_changed`, `contact_updated`, `contact_partner_action`, `interview_scheduled`,
`interview_evaluation_submitted`, `event_scheduled`, `event_interview_evaluation_submitted`,
`folder_job_added`, `folder_job_removed`, `folder_candidate_added`, `folder_candidate_removed`,
`folder_jobapplication_added`, `folder_jobapplication_removed`, `folder_placement_added`,
`folder_placement_removed`, `folder_company_added`, `folder_company_removed`,
`folder_contact_added`, `folder_contact_removed`, `folder_updated`, `user_suspended`, `sms_sent`,
`opportunity_stage_changed`.

Each event needs `offline_access` plus the read scope for its object (for example `read` or
`read_placement` for `placement_approved`).

## Event Payload Structure

```json
{
  "apiVersion": 2,
  "event": "placement_approved",
  "eventId": "00000000-0000-0000-0000-000000000000",
  "eventDate": "2019-01-01T09:00:00Z",
  "eventUser": {},
  "eventData": {}
}
```

| Field | Description |
|-------|-------------|
| `apiVersion` | API version, `2` |
| `event` | The event name |
| `eventId` | Unique id for the event (use it for idempotency) |
| `eventDate` | When the event occurred (ISO 8601) |
| `eventUser` | The user who triggered the event |
| `eventData` | Event-specific data; the docs also show `<event details>` alongside these fields, so inspect a real delivery for the exact shape per event |

## Event Filters

`jobapplication_status_changed` supports an `eventFilters` entry with `statusId` (array of
integers) or `statusActive` (boolean) so you only receive changes to particular statuses.

## Full Event Reference

See the JobAdder API reference, "Webhooks" section: https://api.jobadder.com/v2/docs
