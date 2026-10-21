# Fivetran Webhooks Overview

## What Are Fivetran Webhooks?

Fivetran webhooks push JSON notifications to your HTTPS endpoint when something happens in your data pipelines: a sync starts or ends, a connection test passes or fails, a transformation runs, or a connection is created, paused, edited, or deleted. They are managed only through the Fivetran REST API (there is no dashboard UI for creating them), either at **account** level (all groups) or **group** level.

## Common Event Types

The event name is in the `event` field of the JSON body. Names below are from the official docs.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `sync_start` | A connection sync starts | Mark a pipeline as running |
| `sync_end` | A connection sync ends (`data.status` `SUCCESSFUL` or `FAILED`) | Trigger dbt/BI refresh, alert on failure |
| `status` | Connection status change (deprecated) | Legacy only; prefer `sync_*` |
| `transformation_start` | A transformation run starts | Track transformation runs |
| `transformation_succeeded` | A transformation run succeeds | Trigger downstream jobs |
| `transformation_failed` | A transformation run fails | Alert on-call |
| `connection_successful` | A connection setup test succeeds | Confirm onboarding |
| `connection_failure` | A connection setup test fails | Notify the connection owner |
| `create_connector`, `pause_connector`, `resume_connector`, `edit_connector`, `delete_connector`, `force_update_connector`, `resync_connector`, `resync_table` | Connection lifecycle actions | Audit logging |

## Event Payload Structure

```json
{
  "event": "sync_end",
  "created": "2021-08-18T11:38:34.386Z",
  "connector_type": "asana",
  "connector_id": "mystified_presiding",
  "connector_name": "mystified_presiding",
  "sync_id": "mystified_presiding",
  "destination_group_id": "deck_enjoy",
  "data": { "status": "SUCCESSFUL" }
}
```

`data` varies by event type. There is no unique event ID header, so de-duplicate on `event` + `sync_id` (or `connector_id` + `created`) because retries can redeliver.

## Delivery Behaviour

- 10-second timeout; respond `200 OK` quickly and do the work asynchronously.
- Failed deliveries are retried up to 5 times over 24 hours (6 min, 21 min, 1h 18m, ...).
- A webhook that only returns non-2xx for more than 3 days is deactivated.

## Full Event Reference

See [Fivetran Webhooks](https://fivetran.com/docs/rest-api/webhooks).
