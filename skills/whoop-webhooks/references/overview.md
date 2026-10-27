# WHOOP Webhooks Overview

## What Are WHOOP Webhooks?

WHOOP webhooks notify your app when data changes for a user who has authorized it. They are thin notifications: you receive identifiers and an event type, then fetch the data from the WHOOP v2 API with that user's access token. Webhooks are sent as `POST` requests over HTTPS to the Webhook URL configured on your app. All event types go to every configured URL; respond `2xx` to ones you don't need.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `sleep.updated` | A sleep is created or updated | Fetch `GET /v2/activity/sleep/{id}` |
| `sleep.deleted` | A sleep is deleted | Remove the stored sleep |
| `workout.updated` | A workout is created or updated | Fetch `GET /v2/activity/workout/{id}` |
| `workout.deleted` | A workout is deleted | Remove the stored workout |
| `recovery.updated` | A recovery is created or updated | Fetch the recovery for the sleep `id` |
| `recovery.deleted` | A recovery is deleted (its sleep was deleted) | Remove the stored recovery |

Editing a sleep typically yields both `sleep.updated` and `recovery.updated`.

## Event Payload Structure

```json
{
  "user_id": 456,
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "sleep.updated",
  "trace_id": "e369c784-5100-49e8-8098-75d35c47b31b"
}
```

| Field | Description |
|-------|-------------|
| `user_id` | WHOOP user the event is for (int64) |
| `id` | v2: UUID of the object. For recovery events it is the UUID of the associated **sleep**. (v1 webhooks used integer ids and have been removed.) |
| `type` | One of the six event types above |
| `trace_id` | Trace ID of the event |

## Delivery and Retries

- A delivery fails on any non-2xx response or no response before the timeout.
- WHOOP retries five times over about an hour.
- Duplicates and missed webhooks are possible: make handlers idempotent and reconcile through the API.
- Return `2xx` quickly and process asynchronously.

## Full Event Reference

See [WHOOP's webhook documentation](https://developer.whoop.com/docs/developing/webhooks/).
