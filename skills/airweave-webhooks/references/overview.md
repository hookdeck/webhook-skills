# Airweave Webhooks Overview

## What Are Airweave Webhooks?

[Airweave](https://airweave.ai) syncs apps (Notion, Slack, GitHub and more) into searchable collections for AI agents. Its webhooks (currently beta) push a notification when something happens in your organization: a sync job changes state, a source connection is created or authenticated, or a collection changes. Instead of polling the API for "is the sync done yet?", you register an endpoint and Airweave calls it. [Svix](https://www.svix.com/) delivers and signs every request.

## Common Event Types

The docs list 11 events in three domains. The list may not be exhaustive, so handle unknown types gracefully.

### Sync events

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `sync.pending` | A sync job is created and queued | Show "queued" status |
| `sync.running` | The sync job starts processing | Show progress state |
| `sync.completed` | The sync job finishes successfully | Kick off downstream workflows, refresh dashboards |
| `sync.failed` | The sync job hits an error | Alert, open a ticket |
| `sync.cancelled` | The sync job is manually cancelled | Clear in-progress state |

### Source connection events

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `source_connection.created` | A source connection record is created (may not be authenticated yet) | Track onboarding |
| `source_connection.auth_completed` | The OAuth flow completes and the connection is ready | Start the first sync, notify the user |
| `source_connection.deleted` | A source connection and its data are removed | Clean up references |

### Collection events

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `collection.created` | A new collection is created | Provision downstream resources |
| `collection.updated` | Name or configuration changes | Sync metadata |
| `collection.deleted` | A collection and all its data are removed | Clean up references |

## Event Payload Structure

Bodies are flat JSON, one shape per domain. Every one has a top-level `event_type` and an ISO 8601 `timestamp`. There is no envelope and no event ID field.

### Sync events

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

The `entities_*` and `chunks_written` metrics appear only on `sync.completed`. `sync.failed` adds an `error` string.

### Source connection events

```json
{
  "event_type": "source_connection.auth_completed",
  "source_connection_id": "660e8400-e29b-41d4-a716-446655440001",
  "collection_readable_id": "finance-data-ab123",
  "source_type": "notion",
  "is_authenticated": true,
  "timestamp": "2025-01-15T13:56:00Z"
}
```

### Collection events

```json
{
  "event_type": "collection.created",
  "collection_id": "770e8400-e29b-41d4-a716-446655440002",
  "collection_name": "Finance Data",
  "collection_readable_id": "finance-data-ab123",
  "timestamp": "2025-01-15T13:50:00Z"
}
```

## Delivery Headers

| Header | Description |
|--------|-------------|
| `svix-id` | Message identifier, stable across retries to one subscription |
| `svix-timestamp` | Unix seconds of the delivery attempt |
| `svix-signature` | Space-delimited `v1,<base64>` HMAC-SHA256 signatures |

The content type is `application/json`. See [verification.md](verification.md) for how to check the signature.

## Delivery and Retries

- A `2xx` response is a delivery. A `4xx`, `5xx` or a 30 second timeout is retried.
- 5 attempts: immediate, 5 seconds, 5 minutes, 30 minutes, 2 hours. After that the message is failed and can be recovered through the recover endpoint or `recover_since`.
- Delivery is at least once. Deduplicate on `svix-id`.
- Events are not guaranteed to arrive in order. Use the payload `timestamp`.

## Full Event Reference

For the complete payload definitions, see [Airweave's webhook types and formats](https://docs.airweave.ai/webhooks/types-and-formats) and the [webhooks overview](https://docs.airweave.ai/webhooks/overview).
