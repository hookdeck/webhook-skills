# Doubleword Webhooks Overview

## What Are Doubleword Webhooks?

Doubleword is a batch inference API. Instead of polling a batch for status, you can register one
webhook URL on your user profile and Doubleword sends an HTTP POST when a batch reaches a
terminal state (completed or failed). Requests follow the Standard Webhooks specification.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `batch.completed` | A batch completes (`data.status` is `completed`) | Download `output_file_id` and `error_file_id` with the files API, start downstream processing |
| `batch.failed` | A batch fails (`data.status` is `failed`) | Alert, inspect the error file, resubmit |

Both events are always sent; there is no per-event subscription. Doubleword documents these two
types and the list may not be exhaustive, so acknowledge unknown types with a `2xx`.

## Event Payload Structure

The body is JSON with a `{type, timestamp, data}` envelope. The event type is the top-level `type`.

```json
{
  "type": "batch.completed",
  "timestamp": "2026-01-15T12:00:00Z",
  "data": {
    "batch_id": "batch_29cd13af-5ce9-487e-98ff-4eb6730c12b4",
    "status": "completed",
    "request_counts": { "total": 100, "completed": 98, "failed": 2, "cancelled": 0 },
    "output_file_id": "file_b4213e44-3c85-4689-9cae-e6d986785143",
    "error_file_id": "file_49fdc045-77a8-409b-bb3e-d661df05f9fb",
    "created_at": "2026-01-15T10:00:00Z",
    "finished_at": "2026-01-15T12:00:00Z"
  }
}
```

(The example in Doubleword's docs contains `//` comments, which are not part of the real JSON body.)

## Headers

`webhook-id`, `webhook-timestamp` (Unix seconds) and `webhook-signature`
(`v1,<base64>`, possibly several space-separated entries).

## Delivery

- `2xx` acknowledges; any other status or a timeout is a failure.
- Failures are retried with exponential backoff until attempts run out.
- 10 consecutive failed deliveries disable the webhook. Re-enable it on your profile.
- The docs give no schedule, timeout or ordering guarantee, so make handlers idempotent (key on `webhook-id` or `data.batch_id`).

## Full Event Reference

See [Doubleword batch notifications and webhooks](https://docs.doubleword.ai/inference-api/batch-notifications-and-webhooks).
