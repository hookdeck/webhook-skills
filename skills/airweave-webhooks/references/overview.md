# Airweave Webhooks Overview

## What Are Airweave Webhooks?

[Airweave](https://airweave.ai) is an open-source context-retrieval layer that syncs apps into
searchable collections for agents. Its webhooks (currently in beta) send an HTTPS `POST` to an
endpoint you register when a sync job, a source connection or a collection changes, so you don't
have to poll. Deliveries go through Svix and are signed (see [verification.md](verification.md)).

| Aspect | Value |
|--------|-------|
| Method | `POST`, `Content-Type: application/json` |
| Signature headers | `svix-id`, `svix-timestamp`, `svix-signature` (Standard Webhooks) |
| Success | Any `2xx`. `4xx`, `5xx` and a 30 second timeout are retried |
| Retries | 5 attempts: immediate, 5 seconds, 5 minutes, 30 minutes, 2 hours. Then the message is marked failed |
| Recovery | `POST /webhooks/subscriptions/{id}/recover`, or `recover_since` when re-enabling a subscription |
| Delivery | At-least-once, not ordered. Deduplicate on the `svix-id` header |

## Event Payload Structure

Bodies are flat and differ per domain. Every event has `event_type` and `timestamp`:

```json
{
  "event_type": "sync.completed",
  "sync_id": "440e8400-e29b-41d4-a716-446655440099",
  "sync_job_id": "550e8400-e29b-41d4-a716-446655440000",
  "collection_id": "770e8400-e29b-41d4-a716-446655440002",
  "collection_readable_id": "finance-data-ab123",
  "collection_name": "Finance Data",
  "source_connection_id": "660e8400-e29b-41d4-a716-446655440001",
  "source_type": "notion",
  "entities_inserted": 42,
  "entities_updated": 10,
  "entities_deleted": 3,
  "entities_skipped": 120,
  "chunks_written": 215,
  "timestamp": "2025-01-15T14:05:00Z"
}
```

| Domain | Fields besides `event_type` and `timestamp` |
|--------|---------------------------------------------|
| Sync | `sync_id`, `sync_job_id`, `collection_id`, `collection_readable_id`, `collection_name`, `source_connection_id`, `source_type`. `sync.completed` adds `entities_inserted`, `entities_updated`, `entities_deleted`, `entities_skipped`, `chunks_written`; `sync.failed` adds `error` |
| Source connection | `source_connection_id`, `collection_readable_id`, `source_type`, `is_authenticated` |
| Collection | `collection_id`, `collection_name`, `collection_readable_id` |

The body has no event id. Airweave's message-history API shows an `event_id` for deduplication,
but it is not in the delivered body, so use the `svix-id` header, which stays the same across
retries. The message-history example also shows `job_id` and `status` in a sync payload while the
event pages use `sync_job_id`, so read ids defensively.

## Common Event Types

11 events are documented (the list may not be exhaustive):

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `sync.pending` | A sync job is created and queued | Show "queued" state |
| `sync.running` | The sync job starts processing | Progress display |
| `sync.completed` | The sync job finishes successfully; carries entity and chunk counts | Trigger downstream workflows, refresh search |
| `sync.failed` | The sync job hit an error; `error` has the details | Alert, re-authenticate the source |
| `sync.cancelled` | The sync job was cancelled manually | Clear "running" state |
| `source_connection.created` | A source connection record is created (OAuth may be unfinished, see `is_authenticated`) | Track onboarding |
| `source_connection.auth_completed` | The OAuth flow completed and the connection is ready | Start the first sync, tell the user |
| `source_connection.deleted` | A source connection and its data were removed | Clean up references |
| `collection.created` | A collection was created | Register it in your app |
| `collection.updated` | Collection properties changed | Refresh cached names |
| `collection.deleted` | A collection and its data were removed | Remove references |

The examples handle exactly these 11 events and acknowledge anything else with `200`.

## Delivery Rules Worth Planning For

- **Not ordered, at-least-once.** Don't let a late `sync.running` overwrite a `sync.completed`.
- **Respond fast.** Return `200` immediately and process on a queue; a slow handler hits the 30
  second timeout and is retried.
- **Return `200` for events you don't handle.** `4xx` responses are retried too.
- **Beta.** Event types may be added, so ignore unknown ones instead of failing.

## Full Event Reference

See Airweave's [types and formats](https://docs.airweave.ai/webhooks/types-and-formats) page for
every payload shape, and the [setup guide](https://docs.airweave.ai/webhooks/setup).
