# Oyster Webhooks Overview

## What Are Oyster Webhooks?

Oyster (a global HR and employer-of-record platform) pushes events to a public endpoint you
register through its API, instead of making you poll. The docs' example: be notified every
time an expense is created or approved. Webhooks are sent as `POST` requests with a JSON body.

Webhooks carry no signature. The only authentication is the `sharedSecret` you registered,
which Oyster sends as `Authorization: Bearer <sharedSecret>` (see [verification.md](verification.md)).

## Envelope

Every webhook has the same shape:

```json
{
  "eventName": "expenses.expense_approved",
  "eventTimestamp": "2026-04-21T09:35:13Z",
  "id": "wh_01J19XRFZ2Q4QBDC6CA461AGT7",
  "companyId": "ABC1234",
  "data": { "expenseId": "...", "reviewState": "...", "previousReviewState": "..." }
}
```

| Field | Meaning |
|-------|---------|
| `eventName` | `namespace.event_name`; filter on this |
| `eventTimestamp` | When the event occurred (ISO 8601 UTC); use for ordering and debugging delays |
| `id` | Globally unique notification ID, always prefixed `wh_`. Two developer applications receiving the same logical event get different IDs |
| `companyId` | Company the event occurred for. Partners use it to match the customer in their system |
| `data` | Event-specific object |

## Common Event Types

| Event | Triggered When | `data` keys |
|-------|----------------|-------------|
| `hiring.employment_engaged` | An EOR employment is engaged | `engagementId` |
| `hiring.employment_submitted` | An employment is submitted | |
| `hiring.employment_onboarding_completed` | Onboarding is completed | |
| `expenses.expense_created` | An expense is created | |
| `expenses.expense_approved` | An expense is approved | `expenseId`, `reviewState`, `previousReviewState` |
| `expenses.expense_declined` | An expense is declined | |
| `contract.change_applied` | A contract change is applied | `engagementChangeId`, `changeType`, `state` |
| `contract.change_approved` | A contract change is approved | |
| `benefits.enrollment_enrolled` | A benefits enrollment is enrolled | `engagementId`, `enrollmentId` |
| `benefits.enrollment_opted_out` | An employee opts out | |
| `offboarding.engagement_terminated` | An engagement is terminated | |
| `payments.charge_paid` | A charge is paid | |

`data` keys are listed only where Oyster's reference documents them for the event. Treat
unlisted keys as open.

## Event Namespaces

The docs' Webhook Events reference groups events under: `benefits`, `contract`
(`contract.change_*`), `engagements` (documents and payslips), `expenses`, `hiring`,
`identity_verification`, `invoicing`, `offboarding`, `async_operation_completed`, `payments`,
`payroll`, `time_off` and `time_tracking`. Ignore names you don't handle and still return `200`, so Oyster doesn't retry them.

## Delivery and Retries

- Respond `200` within **5 seconds**. Otherwise the dispatch counts as failed.
- Failed deliveries are retried up to **9 total attempts over about 48 hours**: 30 seconds,
  5 minutes, 30 minutes, 1 hour, 3 hours, 6 hours, 12 hours, 1 day, with a little jitter.
- Webhooks may be delivered more than once, so dedupe on `id`.
- `GET /v1/webhooks/dispatches` lists dispatches, and `POST /v1/webhooks/{id}/test` sends a
  test payload to an endpoint.

## Full Event Reference

See Oyster's docs: https://docs.oysterhr.com/docs/getting-started-with-webhooks and the
Webhook Events section of the API reference.
