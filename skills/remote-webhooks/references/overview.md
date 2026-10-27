# Remote Webhooks Overview

## What Are Remote Webhooks?

Remote (remote.com) offers global employment (EOR), contractor management and payroll. Its API
webhooks notify your server when something changes: an employee finishes onboarding, a time off
request is filed, a payslip is released. You register a callback URL with `POST /v1/webhook-callbacks`
and Remote sends an HTTP `POST` with a JSON body to it for each subscribed event.

Every delivery carries `X-Remote-Timestamp` (Unix milliseconds) and `X-Remote-Signature` (hex HMAC-SHA256).
The event name is the body's `event_type` field.

## Delivery Behaviour

- A `2xx` response is success.
- A `4xx` or `5xx` counts as **delivered** and is never retried.
- Only transport failures (timeout, connection, DNS, TLS) are retried, at 30 s, 5 min, 1 h, 6 h and 18 h.
- Missed events are listed and replayed through the webhook-events API.

So return `2xx` only once the event is safely accepted, and use the replay API to recover events
your handler rejected with a 4xx or 5xx.

## Common Event Types

Remote documents 112 event types. Examples used in this skill:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `employment.onboarding.completed` | An employee's onboarding is fully completed | Provision accounts, notify the manager |
| `employment.onboarding_task.completed` | Each onboarding task is completed | Update an onboarding checklist |
| `timeoff.requested` | An employee submits a time off request | Route to an approver |
| `timeoff.approved` | A time off request is approved | Update team calendars |
| `payslip.released` | A payslip becomes available | Fetch and archive the payslip |
| `contract.termination_date_reached` | A contract reaches its termination date | Start offboarding |

Other families (all documented): `company.*` (e.g. `company.activated`, `company.eor_hiring.referred`),
`contract_amendment.*`, `contractor_invoice.*`, `employment.*` (e.g. `employment.start_date.changed`,
`employment.status.updated`), `expense.*`, `incentive.*`, `offboarding.*`, `timeoff.*`, `timesheet.*`,
`travel_letter.*`, `work_authorization.*`, `billing_document.issued` and more.

## Event Payload Structure

Payloads are flat JSON with an `event_type` and identifiers such as `employment_id` and `company_id`,
plus event-specific fields. For example `employment.onboarding_task.completed`:

```json
{
  "company_id": "9e88cdac-4e57-46ca-a5a8-580150935cd8",
  "completed_task": {
    "action": "identity_verification",
    "completed_at": "2023-02-16T07:52:26Z",
    "description": "To help us keep you and our platform safe.",
    "name": "Verify your identity",
    "required": true,
    "status": "completed"
  },
  "employment_id": "b6e66f7c-9026-4afc-9f43-37bb31a8e509",
  "event_type": "employment.onboarding_task.completed"
}
```

The documented payloads show no event id, so dedupe on a business key (event type plus resource id
and the changed state) or on the replayed event record from the webhook-events API.

## Full Event Reference

See [Remote's available webhooks](https://developer.remote.com/docs/available-webhooks) and
[introduction to webhooks](https://developer.remote.com/docs/introduction-to-webhooks).
