# Meilisearch Webhooks Overview

## What Are Meilisearch Webhooks?

Meilisearch processes indexing and settings changes asynchronously as **tasks**. A webhook
lets Meilisearch notify an HTTP endpoint when tasks finish, so you can purge a cache after a
successful index update, alert your team when a task fails, or log every task for audit.

When a task completes, Meilisearch sends an HTTP `POST` to your URL. The request has:

- `Content-Type: application/x-ndjson`
- `Content-Encoding: gzip`
- an optional `Authorization` header (the value you configured), sent verbatim
- a gzip-compressed body of **ndjson**: one finished task object per line

```
{"uid":1,"indexUid":"movies","status":"succeeded","type":"documentAdditionOrUpdate",...}
{"uid":2,"indexUid":"movies","status":"failed","type":"documentAdditionOrUpdate",...}
```

Several tasks can arrive in a single request, so always process every line. Your endpoint
must respond with a `2xx`. On Meilisearch Cloud anything else is a failure and is retried with
exponential backoff. The self-hosted docs don't mention retries: the open-source engine sends
each request once (30-second timeout) and only logs a failure, so respond fast and don't count on
a redelivery.
A Meilisearch Cloud project can have up to 20 webhooks.

## Common Task Types

| `type` | Triggered When | Common Use Cases |
|--------|----------------|------------------|
| `documentAdditionOrUpdate` | Documents were added or updated | Purge a CDN or app cache |
| `documentDeletion` | Documents were deleted | Sync downstream stores |
| `settingsUpdate` | Index settings changed | Audit configuration changes |
| `indexCreation` | An index was created | Provision dependent resources |
| `indexUpdate` | An index was updated (e.g. primary key) | Audit |
| `indexDeletion` | An index was deleted | Clean up references |
| `indexSwap` | Indexes were swapped | Signal a blue/green deploy |
| `dumpCreation` | A dump was created (`details.dumpUid`) | Ship backups |
| `snapshotCreation` | A snapshot was created | Ship backups |
| `taskCancelation` / `taskDeletion` | Queue maintenance | Audit |

`status` is one of `succeeded`, `failed` or `canceled`.

## Task Object Fields

| Field | Description |
|-------|-------------|
| `uid` | Unique task id |
| `indexUid` | Index the task ran on (`null` for some global tasks) |
| `status` | `succeeded`, `failed` or `canceled` |
| `type` | Task type, see above |
| `details` | Type-specific, e.g. `receivedDocuments` / `indexedDocuments`, `deletedDocuments`, `dumpUid`, a copy of the settings payload |
| `error` | Present on failed tasks (`message`, `code`, `type`, `link`) |
| `canceledBy` | `uid` of the `taskCancelation` task, or `null` |
| `enqueuedAt`, `startedAt`, `finishedAt`, `duration` | Timing |

## Full Event Reference

See [Meilisearch's webhook documentation](https://www.meilisearch.com/docs/capabilities/platform/management/webhooks)
and [Tasks and asynchronous operations](https://www.meilisearch.com/docs/capabilities/indexing/tasks_and_batches/async_operations).
