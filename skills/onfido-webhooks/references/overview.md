# Onfido Webhooks Overview

## What Are Onfido Webhooks?

Onfido (now Entrust Identity Verification) uses webhooks to notify you asynchronously when the status of a check, report, or workflow run changes. You register an HTTPS URL, choose which events to subscribe to, and Onfido POSTs a JSON event to it. Up to 20 webhooks can be configured, for the live environment, the sandbox, or both.

Delivery details:

- Respond with an HTTP `20x` within **10 seconds**.
- Otherwise Onfido retries 5 times: 30 seconds, 2 minutes, 15 minutes, 2 hours and 10 hours after the first attempt.
- **Circuit breaker:** if 5 requests to the same webhook fail in a row, the webhook is disabled.
- **At-least-once delivery:** duplicates are possible, so make handlers idempotent.
- **No ordering guarantee:** events can arrive out of order.
- The URL must be HTTPS (TLS 1.2 and 1.3 supported).
- Requests come from fixed IPs (EU, US and Canada ranges, listed in the Onfido docs) if you want to allowlist them.

## Common Event Types

| Event (`payload.action`) | `resource_type` | Triggered When |
|--------------------------|-----------------|----------------|
| `check.started` | `check` | A check has been started |
| `check.completed` | `check` | A check has been completed |
| `report.completed` | `report` | A report has been completed and results are available |
| `workflow_task.started` | `workflow_task` | A task of a workflow run has started |
| `workflow_task.completed` | `workflow_task` | A workflow task has been completed |
| `workflow_run.completed` | `workflow_run` | A workflow run has been completed |

Other events in the docs:

- **Checks and Reports** (for customers not yet on Workflow Studio): `check.reopened`, `check.withdrawn`, `check.form_completed`, `report.withdrawn`, `report.resumed`, `report.cancelled`, `report.awaiting_approval`
- **Studio:** `workflow_timeline_file.created`, `workflow_run_evidence_folder.created`
- **General:** `audit_log.created`, `watchlist_monitor.matches_updated`

Some payloads (`audit_log.created`, `watchlist_monitor.matches_updated`, `workflow_*`) can contain personal data.

## Event Payload Structure

```json
{
  "payload": {
    "resource_type": "report",
    "action": "report.completed",
    "object": {
      "id": "<REPORT_ID>",
      "status": "complete",
      "completed_at_iso8601": "2019-10-28T15:00:39Z",
      "href": "https://api.onfido.com/v3.6/reports/<REPORT_ID>"
    }
  }
}
```

- `payload.object` holds the `id`, `status`, a completion timestamp and an `href` for fetching the full resource from the API.
- Workflow events (`workflow_run.*`, `workflow_task.*`) add `payload.resource` with the full Workflow Run or Task object.
- Webhook payloads are notifications. Fetch the full result from the API using `object.href`/`object.id`.

## Full Event Reference

For the complete list of events, see [Onfido's webhook documentation](https://documentation.onfido.com/api/latest/#webhooks).
