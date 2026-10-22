# Trigger.dev Webhooks Overview

## What Are Trigger.dev Webhooks?

Trigger.dev is a background jobs platform. Its outbound webhooks are **alert notifications**: when you add a webhook alert channel to a project, Trigger.dev POSTs a signed JSON payload to your URL whenever a matching alert fires. There are no webhooks for general run lifecycle events (started, completed, and so on).

## Common Event Types

The event type is the `type` field in the body.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `alert.run.failed` | A run fails once its retries are exhausted | Paging, incident creation, support tooling |
| `alert.deployment.success` | A deployment succeeds | Deploy notifications, status pages |
| `alert.deployment.failed` | A deployment fails | Notify the author, open a ticket |
| `alert.error` | An error group alert fires (`new_issue`, `regression`, `unignored`) | Create issues for new or regressed errors |

## Event Payload Structure

Every payload shares these properties:

| Field | Description |
|-------|-------------|
| `id` | Unique identifier for this webhook event (use it for idempotency) |
| `created` | When the event was created |
| `webhookVersion` | Version of the payload format |
| `type` | One of the event types above |
| `object` | The alert-specific payload |

`object` contents by type:

- **`alert.run.failed`**: `task` (`id`, `filePath`, `exportName`, `version`), `run` (`id`, `number`, `status`, `error`, `isOutOfMemoryError`, `machine`, `dashboardUrl`, `tags`, ...), `environment`, `organization`, `project`
- **`alert.deployment.success`**: `deployment` (`id`, `status`, `version`, `shortCode`, `deployedAt`), `tasks`, optional `git` and `vercel`, plus `environment`, `organization`, `project`
- **`alert.deployment.failed`**: `deployment` (with `failedAt`), `error` (`name`, `message`, optional `stack`, `stderr`), optional `git` and `vercel`, plus `environment`, `organization`, `project`
- **`alert.error`**: `classification` (`new_issue`, `regression` or `unignored`), `error` (`fingerprint`, `type`, `message`, `stackTrace`, ...)

`environment.type` is `PRODUCTION`, `STAGING` or `PREVIEW`.

## Full Event Reference

For the complete payload fields, see [Trigger.dev alert webhooks](https://trigger.dev/docs/troubleshooting-alerts#alert-webhooks).
