# Mistral Webhooks Overview

## What Are Mistral Webhooks?

Mistral AI Studio voice agents send webhooks to your backend when a call starts, ends, or fails, so you don't have to poll. Typical uses: update a CRM record, store transcripts in a data warehouse, alert on failures, or track call duration for billing. Webhooks are the server-side record of each call; to react while a conversation is running, use the session events instead.

You register an endpoint URL and Mistral sends it a signed JSON payload each time an event happens. Every delivery is an HTTP `POST` with `content-type: application/json`.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `call_started` | A session is created and the voice pipeline is ready | Open a call record, start billing timer |
| `call_ended` | A session ends normally | Save transcript, record duration, update CRM |
| `call_failed` | A session fails to start, or hits a fatal error during the call | Alerting, retry logic, incident tracking |

## Event Payload Structure

Every event uses the same envelope:

```json
{ "event": "<event_type>", "created_at": "2026-09-08T14:32:10Z", "data": { } }
```

| Field | Type | Description |
|-------|------|-------------|
| `event` | string | Event type |
| `created_at` | string | When the event was emitted (ISO 8601 UTC) |
| `data` | object | Event payload |

### `call_started` data

`session_id`, `agent_id`, `model`, `started_at` (Unix seconds).

### `call_ended` data

`session_id`, `agent_id`, `model`, `duration_seconds`, `started_at`, `ended_at` (Unix seconds), `transcript` (array of `{ role: "user" | "assistant", content: string | null }`, or `null`). The transcript is best effort: if it isn't ready in time, it is `null` and the rest of the payload is complete.

### `call_failed` data

`session_id`, `agent_id`, `model`, `error` (machine-readable reason such as `token_error`, `db_error`, `livekit_error`, or a disconnection reason).

## Delivery and Retries

| Behavior | Detail |
|----------|--------|
| Timeout | Endpoint must respond within 10 seconds |
| Success | Any 2xx |
| Retries | 5xx and 429: up to 3 attempts in total, backoff 2s then 4s |
| Not retried | Other 4xx |
| Transport errors | DNS/TLS/connection reset retried on the same schedule |

Because deliveries can be retried, use `session_id` and `event` together to skip duplicates.

## Full Event Reference

See [Mistral's webhook documentation](https://docs.mistral.ai/studio/audio/voice-agents/webhooks).
