# Semaphore CI Webhooks Overview

## What Are Semaphore CI Webhooks?

Semaphore CI (semaphore.io) sends a webhook through a **notification**. A notification has rules that
filter on projects, branches, tags, pipelines and results, and a webhook endpoint to post to. When a
matching pipeline finishes, Semaphore posts the pipeline's result and its blocks and jobs to the URL.
Notifications are created in the UI or with `sem create notification`.

## Which Events Does Semaphore Send?

There is no event-name field or header. Every delivery is one finished pipeline, so dispatch on
`pipeline.result`:

| `pipeline.result` | Triggered When | Common Use Cases |
|-------------------|----------------|------------------|
| `passed` | A pipeline finishes successfully | Mark a commit green, trigger a deploy |
| `failed` | A block or job in the pipeline failed | Alert the team, open an issue |
| `stopped` | The pipeline was stopped (`pipeline.result_reason`, for example `user`) | Record the stop |
| `canceled` | The pipeline was canceled | Record the cancellation |

Which results you receive is controlled by the `results` filter on the notification rule.

## Event Payload Structure

```json
{
  "version": "1.0.0",
  "organization": { "name": "semaphore", "id": "36360e31-fee6-42b2-9f6c-999d4c06ce81" },
  "project": { "name": "notifications", "id": "91e34570-bebe-42b6-b47a-ca710b2b8927" },
  "repository": { "url": "https://github.com/semaphoreci/myproject", "slug": "semaphoreci/notifications" },
  "revision": {
    "reference_type": "branch",
    "reference": "refs/heads/rw/webhook_impl",
    "commit_sha": "2d9f5fcec1ca7c68fa7bd44dd58ec4ff65814563",
    "commit_message": "empty",
    "branch": { "name": "rw/webhook_impl" },
    "sender": { "login": "radwo" }
  },
  "workflow": { "id": "acabe58e-4bcc-4d39-be06-e98d71917703" },
  "pipeline": {
    "id": "fa02c7bd-7a8b-42e0-8d6e-aa0d8a194e19",
    "name": "Notificaitons",
    "state": "done",
    "result": "stopped",
    "result_reason": "user"
  },
  "blocks": [
    { "name": "Lint", "result": "passed", "jobs": [{ "name": "Lint", "status": "finished", "result": "passed" }] }
  ]
}
```

The payload above is trimmed from the sample in Semaphore's notification docs. Each block and job
has its own `result`, so a failed pipeline tells you which job failed.

## Delivery Headers

- `X-Semaphore-Signature-256`: the signature, present only when the notification names a secret.
- `X-Semaphore-Webhook-Id`: an id for the delivery, use it to dedupe.

## Delivery and Retries

The response timeout is per notification (`timeout` in ms, default 500). A retry happens only after a
timeout and only if `retries` is set (default 0, max 5), with exponential backoff and growing
timeouts. Any response, of any status, ends delivery.

## Full Event Reference

See [Semaphore's notifications documentation](https://docs.semaphoreci.com/using-semaphore/notifications).
