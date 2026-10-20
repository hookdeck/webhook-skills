# Render Webhooks Overview

## What Are Render Webhooks?

Render webhooks notify your systems when service events happen in a Render workspace: a build or deploy starts or ends, a service goes down, an autoscaled service adds instances, a cron job finishes, a Render Postgres database fails over. Typical uses are posting to chat, triggering CI/CD (for example deploying a dependent service after `deploy_ended` succeeds), and paging on `server_failed`.

- Configured per **workspace** under **Integrations > Webhooks** (workspace admins only).
- Require a **Pro plan or higher**. Pro workspaces get one destination URL. Scale and Enterprise get up to 100, each with its own event selection.
- Signed with [Standard Webhooks](https://www.standardwebhooks.com/) (see [verification.md](verification.md)).

## What Does a Render Webhook Payload Look Like?

Every notification uses the same "thin" envelope:

```json
{
  "type": "deploy_ended",
  "timestamp": "2025-02-25T16:22:19.979294509Z",
  "data": {
    "id": "evt-cuuuses015js70180jk0",
    "serviceId": "srv-cukouhrtq21c73e9scng",
    "serviceName": "my-service",
    "status": "succeeded"
  }
}
```

| Field | Description |
|-------|-------------|
| `type` | Event type (snake_case, see below) |
| `timestamp` | ISO 8601 time the **service event** occurred. Not the same as the `webhook-timestamp` header, which is when this delivery was sent |
| `data.id` | Service event ID, starts with `evt-`. Identical across retries, so use it for idempotency |
| `data.serviceId` | ID of the service (or datastore) the event is about |
| `data.serviceName` | Name of that service (added 2025-11-10) |
| `data.status` | `succeeded`, `failed` or `canceled`. **Only** on `build_ended`, `deploy_ended`, `cron_job_run_ended` and `job_run_ended` |

## How Do I Get More Details About an Event?

Call the Render API's [Retrieve event](https://api-docs.render.com/reference/retrieve-event) endpoint with `data.id`:

```bash
curl https://api.render.com/v1/events/evt-cph1rs3idesc73a2b2mg \
  -H "Authorization: Bearer $RENDER_API_KEY" -H "Accept: application/json"
```

```json
{
  "id": "evt-cph1rs3idesc73a2b2mg",
  "timestamp": "2025-02-27T07:05:21.091Z",
  "serviceId": "srv-cukouhrtq21c73e9scng",
  "type": "autoscaling_ended",
  "details": { "fromInstances": 1, "toInstances": 2 }
}
```

`details` varies by type. Deploy events include a `deployId` you can pass to `GET /v1/services/{serviceId}/deploys/{deployId}` for the commit or image. Do these API calls **after** acknowledging the webhook, because Render's 15-second timeout includes your processing time.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `build_started` | A build started for a service | Status page, chat notification |
| `build_ended` | A build completed (`status`) | Alert on failed builds |
| `deploy_started` | A deploy started | Chat notification, deploy tracking |
| `deploy_ended` | A deploy completed (`status`) | Smoke tests, deploy dependent services, release notes |
| `server_failed` | A service became unavailable, usually a runtime error | Paging, incident creation |
| `server_available` | A previously unavailable service became available | Resolve incidents |
| `cron_job_run_ended` | A cron job run completed (`status`) | Alert on failed scheduled jobs |
| `job_run_ended` | A one-off job completed (`status`) | Pipeline orchestration |
| `autoscaling_ended` | An autoscaled service finished adding/removing instances | Capacity dashboards |
| `postgres_unavailable` | A Render Postgres database became unavailable | Paging |

## Full Event Catalog

Event types as listed in Render's docs. The dashboard shows them in human-readable form ("Build Ended" for `build_ended`), but payloads always use these strings.

**Deployment lifecycle:** `branch_deleted`, `build_ended`, `build_started`, `commit_ignored`, `deploy_ended`, `deploy_started`, `image_pull_failed`, `job_run_ended`, `pipeline_minutes_exhausted`, `pre_deploy_ended`, `pre_deploy_started`

**Service availability:** `maintenance_ended`, `maintenance_mode_enabled`, `maintenance_mode_uri_updated`, `maintenance_started`, `server_available`, `server_failed`, `server_hardware_failure`, `server_restarted`, `service_resumed`, `service_suspended`, `zero_downtime_redeploy_ended`, `zero_downtime_redeploy_started`

**Scaling:** `instance_count_changed` (manual scaling only), `autoscaling_ended`, `autoscaling_started`, `autoscaling_config_changed`

**Service config:** `plan_changed` (shown as "Instance Type Changed" in the dashboard)

**Cron jobs:** `cron_job_run_ended`, `cron_job_run_started`

**Render Postgres:** `postgres_available`, `postgres_backup_completed`, `postgres_backup_failed`, `postgres_backup_started`, `postgres_cluster_leader_changed`, `postgres_connection_pool_changed`, `postgres_connection_pool_enabled_changed`, `postgres_created`, `postgres_credentials_created`, `postgres_credentials_deleted`, `postgres_disk_size_changed`, `postgres_ha_status_changed`, `postgres_pitr_checkpoint_completed`, `postgres_pitr_checkpoint_failed`, `postgres_pitr_checkpoint_started`, `postgres_restarted`, `postgres_restore_failed`, `postgres_restore_succeeded`, `postgres_unavailable`, `postgres_upgrade_failed`, `postgres_upgrade_started`, `postgres_upgrade_succeeded`, `postgres_read_replica_stale`, `postgres_read_replicas_changed`, `postgres_wal_archive_failed`, `postgres_disk_autoscaling_enabled_changed`

**Render Key Value:** `key_value_available`, `key_value_config_restart`, `key_value_unhealthy`

**Persistent disks:** `disk_created`, `disk_updated`, `disk_deleted`

`server_unhealthy` was **removed** on 2025-11-10. Use `server_failed`. Render adds types over time, so return `200` for types you don't handle.

## Full Event Reference

For the complete, current list and change history, see [Render's webhook documentation](https://render.com/docs/webhooks#event-types).
