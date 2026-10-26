# Bindbee Webhooks Overview

## What Are Bindbee Webhooks?

Bindbee is a unified API for HRIS, ATS and LMS integrations. A webhook sends a signed `POST` with a JSON body to your URL when a connector links, syncs, fails or needs relinking, and when a sync creates or updates records. You create webhooks in the dashboard; each one is pinned to a version and an environment (production, development or both) and subscribed to events by name.

This skill covers **version 2** (`2026.10.06`, current). Version 1 (`2025.01.01`) is deprecated on December 31, 2026, has different event names, and carries no `webhook-*` headers, so the verification in this skill does not apply to it.

## Common Event Types

The event name is the top-level `event` field of the body (`webhook.event` repeats it). 92 events are documented.

### Connector events

| Event | Fires when |
|-------|------------|
| `connector.linked` | A new connector finishes linking and its credentials validate |
| `connector.sync.started` | A sync job begins |
| `connector.sync.completed` | A sync job finishes successfully, after every data event from that sync |
| `connector.sync.failed` | A sync job fails |
| `connector.relink_needed` | A connector's credentials stop working and it moves to `RELINK_NEEDED` |
| `connector.relinked` | A connector in `RELINK_NEEDED` is reconnected and its credentials validate |

### Data events

Data events are named `<category>.<model>.<action>`, where the action is `created` or `updated` (no event reports a deletion). Every model has both, so there are 2 x 43 = 86 data events, plus the 6 connector events.

| Category | Models |
|----------|--------|
| `hris` | `company`, `location`, `group`, `pay_group`, `payroll_code`, `payroll_run_calendar`, `employee`, `employment`, `compensation`, `dependent`, `bank_info`, `employer_benefit`, `benefit`, `dependent_benefit`, `benefit_coverage`, `time_off`, `time_off_balance`, `timesheet_entry`, `payroll_run`, `employee_payroll_run` |
| `ats` | `department`, `office`, `remote_user`, `job`, `job_interview_stage`, `reject_reason`, `tag`, `screening_question`, `candidate`, `application`, `activity`, `attachment`, `eeoc`, `scheduled_interview`, `scorecard`, `offer` |
| `lms` | `category`, `skill`, `user`, `course`, `content`, `enrollment`, `completion` |

Examples: `hris.employee.created`, `hris.employee.updated`, `ats.application.updated`, `lms.enrollment.created`.

### Order within a sync

One sync's events are sent one at a time: `connector.sync.started`, then every `created` event, then every `updated` event (parent models first), then `connector.sync.completed`. A failed sync sends `connector.sync.started`, `connector.sync.failed`, then `connector.relink_needed` if the connection broke. Across syncs and connectors order is not guaranteed: sort by `sequence`.

## Event Payload Structure

```json
{
  "id": "01a0a9df-c758-720a-bae8-9dcce047dde2",
  "event": "hris.employee.created",
  "version": "2026.10.06",
  "sequence": 11,
  "model": "employee",
  "occurred_at": "2026-09-16T11:00:10.198843+00:00",
  "webhook": { "webhook_id": "...", "url": "https://example.com/webhooks/bindbee", "event": "hris.employee.created" },
  "connector": { "id": "...", "integration": { "name": "BambooHR", "slug": "bamboohr" }, "category": "HRIS", "origin_id": "...", "connector_status": "COMPLETE", "name": "Acme Inc", "environment": "production" },
  "data": ["01a0a4fc-a046-76bf-bd66-16218012d4e7"],
  "sync": { "sync_id": "...", "sync_type": "AUTOMATED", "sync_name": "#18" }
}
```

| Field | Notes |
|-------|-------|
| `id` | Equals the `webhook-id` header; identical on every retry. Your dedupe key |
| `sequence` | Increases per connector; gaps are normal |
| `model` | Data events only (`employee`, `bank_info`, ...) |
| `data` | Data events: array of record IDs (read them with the `ids` filter). Connector events: an object with sync state |
| `sync` | Absent on `connector.linked` and `connector.relinked`; `null` when unknown |
| `error` | Only on `connector.sync.failed` and `connector.relink_needed` (`failed_at`, `message`, `detail`) |

Ignore fields you don't recognise: a later version can add them. Headers on every delivery: `webhook-id`, `webhook-timestamp`, `webhook-signature`, plus the legacy `X-BINDBEE-WEBHOOK-SIGNATURE` and `X-BINDBEE-WEBHOOK-VERSION` (unsigned; use it for routing only).

## Delivery and Retries

- Up to 4 attempts, 1, 2 and 4 seconds apart (a `Retry-After` can stretch a wait to 5 seconds), 10 second timeout each.
- Retried: `408`, `429`, any `5xx`, timeouts and network errors. Not retried: other `4xx` and any `3xx` (redirects are not followed).
- After the last attempt there is no redelivery or replay, and a failing endpoint stays enabled. Recover missed data by reading the API with `modified_after`.
- Respond `200` as soon as the signature verifies, then process the event. Return `401` for an invalid signature.

## Full Event Reference

See [Bindbee's webhook events](https://docs.bindbee.dev/guides/webhooks/events.md) and [payload](https://docs.bindbee.dev/guides/webhooks/payload.md) documentation, and the [webhooks overview](https://docs.bindbee.dev/webhooks/overview).
