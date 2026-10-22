# Census Webhooks Overview

## What Are Census Webhooks?

Census is now Fivetran Activations (reverse ETL: warehouse data synced out to SaaS tools). A workspace can register webhook endpoints that Activations POSTs to when a sync changes state. There are two categories: **sync run lifecycle events** and **sync alert events**. Each webhook subscribes to at least one event type.

These are not Fivetran's REST API webhooks (`sync_end`, `X-Fivetran-Signature-256`); see the fivetran-webhooks skill for those.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `sync.triggered` | A sync run has been queued | Track queue time |
| `sync.started` | Active work on the sync run has started | Mark a run as in progress |
| `sync.completed` | The run completed, for both successful and failed runs | Generic completion hook; check `status` |
| `sync.success` | The run completed successfully | Start downstream jobs, refresh dashboards |
| `sync.failed` | The run failed | Page on-call, open a ticket |
| `sync.alert.raised` | A subscribed sync alert in the workspace is triggered | Forward to Slack, PagerDuty |
| `sync.alert.resolved` | A subscribed sync alert is resolved | Close the incident |

## Event Payload Structure

Always present: `workspace_id`, `sync_id`, `sync_run_id`, `event`.

`sync.completed` adds `status`: `"ok"` on success, `"emergency"` if the run failed.

`sync.alert.raised` and `sync.alert.resolved` add `alert_instance_id`, `alert_type`, `message`, `details`, `followup_url`.

```json
{
  "workspace_id": 3167,
  "sync_id": 3167956,
  "sync_run_id": 324399613,
  "event": "sync.completed",
  "status": "ok"
}
```

```json
{
  "workspace_id": 3167,
  "sync_id": 3167956,
  "sync_run_id": 324402082,
  "alert_instance_id": 626248,
  "alert_type": "FailureAlertConfiguration",
  "message": "Sync Failed",
  "details": "Sync has failed with error: A mapped source column has been deleted: email",
  "followup_url": "https://app.getcensus.com/workspaces/3167/syncs/3167956/sync-history",
  "event": "sync.alert.raised"
}
```

The IDs and messages above are examples; values vary per workspace and alert configuration.

## Full Event Reference

For the complete list, see [Sync lifecycle webhooks](https://fivetran.com/docs/activations/syncs/sync-monitoring/sync-lifecycle-webhooks).
