# Granola Webhooks Overview

## What Are Granola Webhooks?

Granola is an AI meeting-notes app. Webhooks notify your systems when notes change so you don't have to poll the Granola API. You register an HTTPS URL as a webhook endpoint; when a subscribed event occurs, Granola sends an HTTP POST with a small JSON payload, and you fetch the latest data through the Granola API with an API key. Webhooks are available on Business and Enterprise plans.

Payloads carry **no note content**. Access checks apply when you fetch the note, so a delivery never exposes more than the API would.

## Common Event Types

| Event (`event_type`) | Sent when | Common use cases |
|----------------------|-----------|------------------|
| `note.generated` | The first AI summary for a note is generated while your endpoint can access it | Sync new meeting notes to a CRM, wiki or Slack |
| `note.edited` | The note's summary is edited or regenerated | Refresh a stored copy of the summary |
| `note.access_granted` | A note is shared with you, directly or via a folder | Discover notes that were generated before you could see them |

If an already-generated note is later shared with you, you get `note.access_granted` rather than `note.generated`, so subscribe to both when using webhooks to discover notes. Omit `events` when creating the endpoint to subscribe to all events.

## Event Payload Structure

```json
{
  "event_id": "8f1c2a4e-6b3d-4e8f-9a2b-1c5d7e9f0a3b",
  "event_type": "note.generated",
  "note_id": "not_1d3tmYTlCICgjy",
  "occurred_at": "2026-01-27T15:30:00Z"
}
```

| Field | Description |
|-------|-------------|
| `event_id` | Unique ID for the event. Retries reuse it, and it equals the `webhook-id` header |
| `event_type` | Which event occurred |
| `note_id` | The note the event is about. Fetch it with Get Note |
| `occurred_at` | When the event occurred (ISO 8601) |
| `data.changed_fields` | `note.edited` only. The fields that changed; currently always `["summary"]` |

## Delivery Behaviour

- Your endpoint has **15 seconds** to respond.
- `2xx` = delivered. `408`, `429`, `5xx`, network errors and timeouts are retried with exponential backoff for four days.
- `3xx` (redirects are not followed) and other `4xx` fail permanently.
- After four days without a success, Granola disables the endpoint and emails its creator or workspace admins. Missed events are not replayed; re-enable it in Settings → Connectors → Webhooks.

## Full Event Reference

See [Granola's webhook documentation](https://docs.granola.ai/webhooks).
