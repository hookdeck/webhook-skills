# Databricks Webhooks Overview

## What Are Databricks Webhooks?

A workspace admin can create a **notification destination** of type Webhook.
Jobs, tasks, and Databricks SQL alerts that use that destination POST a JSON
payload to your HTTPS URL. The sending service defines the payload, so job
notifications and SQL alert notifications look different.

Webhooks are **not signed**. The only authentication Databricks provides is the
optional HTTP Basic username and password (or OAuth, Beta, out of scope here)
configured on the destination.

## Common Event Types

### Jobs and tasks (`event_type`)

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `jobs.on_start` | A run starts | Mark a pipeline as running |
| `jobs.on_success` | A run stops and completed in a successful or succeeded-with-failures state | Trigger downstream work |
| `jobs.on_failure` | A run stops in an unsuccessful state | Page on-call, open a ticket |
| `jobs.on_duration_warning_threshold_exceeded` | A run exceeds the configured duration threshold | Warn about slow runs |

### SQL alerts (`event`)

| Event | Triggered When |
|-------|----------------|
| `alert_state_change` | A Databricks SQL alert changes state (for example to `TRIGGERED` or `OK`) |

## Event Payload Structure

Job run start:

```json
{
  "event_type": "jobs.on_start",
  "workspace_id": "your_workspace_id",
  "run": { "run_id": "run_id" },
  "job": { "job_id": "job_id", "name": "job_name" }
}
```

Task-level notifications add `task.task_key` and `run.parent_run_id` (the run ID
of the parent job run); `run.run_id` is then the task's run ID.

SQL alert payloads have `event` (`alert_state_change`), `url_base`, and an
`alert` object holding `title`, `description`, and a nested `alert` with `id`,
`name`, `owner`, `query_text`, `warehouse_id`, and `evaluations[]` (each with
`state`, `comparison_operator`, `threshold`, `last_evaluated_at`). Fields without
values are omitted, so ignore unknown fields and tolerate missing ones.

## Idempotency

Payloads have no event ID. Dedupe job events on `event_type` + `run.run_id`
(plus `task.task_key` for task-level events).

## Full Event Reference

- [Manage notification destinations](https://docs.databricks.com/aws/en/admin/workspace-settings/notification-destinations)
- [HTTP webhook payloads for jobs](https://docs.databricks.com/aws/en/jobs/notifications)
- [SQL alert webhook payload](https://docs.databricks.com/aws/en/sql/user/alerts/webhook-payload)
