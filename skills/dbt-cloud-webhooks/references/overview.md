# dbt Cloud Webhooks Overview

## What Are dbt Cloud Webhooks?

dbt Cloud sends an HTTP POST with a JSON body to your endpoint when a job run changes state. You subscribe a webhook to one or more events and, optionally, to specific jobs (leave jobs empty to cover every job in the account). Webhooks need a Starter or Enterprise plan.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `job.run.started` | A run starts | Post "build started" to chat, open an incident window |
| `job.run.completed` | A run completes, succeeded or failed. Fires after metadata and artifacts are ingested | Pull artifacts, trigger downstream pipelines, refresh BI |
| `job.run.errored` | A run errors. Fires immediately, so artifacts may not be available yet | Page on-call, open a ticket |

`job.run.errored` is a subset of `job.run.completed`. If you subscribe to both, an errored run delivers two notifications.

## Event Payload Structure

```json
{
  "accountId": 1,
  "webhookId": "wsu_12345abcde",
  "eventId": "wev_2L6Z3l8uPedXKPq9D2nWbPIip7Z",
  "timestamp": "2023-01-31T19:28:15.742843678Z",
  "eventType": "job.run.started",
  "webhookName": "test",
  "data": {
    "jobId": "123",
    "jobName": "Daily Job (dbt build)",
    "runId": "12345",
    "environmentId": "1234",
    "environmentName": "Production",
    "dbtVersion": "1.0.0",
    "projectName": "Snowflake Github Demo",
    "projectId": "167194",
    "runStatus": "Running",
    "runStatusCode": 3,
    "runStatusMessage": "None",
    "runReason": "Kicked off from the UI by test@test.com",
    "runStartedAt": "2023-01-31T19:28:07Z"
  }
}
```

- `job.run.completed`: `runStatus` is `Success` (`runStatusCode` 10) and the data adds `runFinishedAt`.
- `job.run.errored`: `runStatus` is `Errored` (`runStatusCode` 20) and the data adds `runErroredAt`.
- The event name is in `eventType`; use `eventId` for idempotency.

## Delivery Behavior

- dbt retries each event five times and keeps delivery logs for 7 days (Recent Deliveries in the webhook settings).
- Your endpoint must respond within 10 seconds or the delivery counts as failed.
- A webhook is archived after 1,000 consecutive failed deliveries or 7 consecutive days of failures. Updating the endpoint URL or setting `active` to `true` reactivates it.
- The destination must accept an `Authorization` header. Azure Logic Apps and Power Automate may not, so they won't work.

## Full Event Reference

See [dbt's webhook documentation](https://docs.getdbt.com/docs/deploy/webhooks).
