# SaladCloud Webhooks Overview

## What Are SaladCloud Webhooks?

[SaladCloud](https://docs.salad.com) is a distributed GPU cloud. Its Job Queue API accepts jobs and can
deliver each job's result to a webhook URL you set on the job. When a job finishes, SaladCloud sends one
JSON `POST` to that URL shortly afterwards. Every delivery is signed with
[Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks) headers (`webhook-id`,
`webhook-timestamp`, `webhook-signature`), as described in
[SaladCloud's signature guide](https://docs.salad.com/container-engine/how-to-guides/job-processing/webhook-signature).

## Common Event Types

One event type is documented, and the list may not be exhaustive. The name is the top-level `type` in the
JSON body:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `queue.job.succeeded` | A Job Queue job finished successfully | Collect the job `output`, store results, start the next pipeline step |

SaladCloud's docs cover only the payload for a succeeded job. The `type` values for failed or cancelled
jobs are not documented, so the examples log any other type as unhandled and return 200.

## Event Payload Structure

The body is an envelope `{type, timestamp, data}`:

```json
{
  "type": "queue.job.succeeded",
  "timestamp": "2026-10-05T21:15:34.4256376Z",
  "data": {
    "id": "50150edd-e182-47b5-a754-2d2a04d6ee31",
    "status": "succeeded",
    "input": {},
    "output": {},
    "events": [
      { "type": "created", "time": "2026-10-05T21:15:32.1180000Z" },
      { "type": "started", "time": "2026-10-05T21:15:33.0120000Z" },
      { "type": "succeeded", "time": "2026-10-05T21:15:34.4010000Z" }
    ],
    "create_time": "2026-10-05T21:15:32.1180000Z",
    "update_time": "2026-10-05T21:15:34.4010000Z",
    "webhook": "https://callback.example.com/result",
    "organization_name": "my-organization",
    "project_name": "my-project",
    "queue_name": "my-queue"
  }
}
```

- `data` is the job document: `id`, `status`, `input`, `output`, `events`, timestamps, the `webhook` URL,
  and the organization, project and queue names. `input` is your job's input and `output` is your
  application's response.
- `data.events[].type` (`created`, `started`, `succeeded`) are job lifecycle steps. They are **not** the
  webhook event. In the Job Queue API's own job document the same field is called `action`.
- The envelope has no event id. Deduplicate on the `webhook-id` header, or on `data.id` (one job).

## Delivery

One `POST` per succeeded job, to the job's webhook URL. SaladCloud's docs don't describe retries, a
timeout, or ordering, so acknowledge quickly with `200` and process asynchronously. Behind Hookdeck you get
retries, replay and rate limiting regardless.

## Full Event Reference

See [SaladCloud's webhook signature guide](https://docs.salad.com/container-engine/how-to-guides/job-processing/webhook-signature)
for the documented payload.
