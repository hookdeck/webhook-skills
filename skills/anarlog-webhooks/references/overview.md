# Anarlog Webhooks Overview

## What Are Anarlog Webhooks?

Anarlog is a meeting notes app. Its desktop app can push signed meeting events to an HTTPS endpoint you configure under **Settings → Developers → Webhooks**. Webhooks are built into the desktop app and available on every plan.

Deliveries only run while the Anarlog desktop app is open. Events that occur while it is closed are dropped, not queued for later delivery. Anarlog delivers to at most 64 endpoints per event and runs at most 4 deliveries at a time. A new endpoint is subscribed to all events.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `meeting.completed` | A recording session finishes | Archive the transcript, create a CRM activity, notify a channel |
| `note.enhanced` | An AI summary is generated for a meeting | Post the summary, create tasks from action items |
| `webhook.test` | You click **Test** on the endpoint | Confirm the endpoint responds and verifies |

## Event Payload Structure

```json
{
  "id": "evt_...",
  "event": "note.enhanced",
  "created_at": "2026-07-28T09:00:00.000Z",
  "data": {
    "meeting": {
      "id": "...",
      "title": "...",
      "note": {},
      "summaries": [],
      "participants": [],
      "action_items": []
    },
    "transcript_text": "..."
  }
}
```

Meeting events include the note, summaries, participants, action items, and the full transcript text. Only add an endpoint you trust.

## Request Headers

| Header | Content |
|--------|---------|
| `x-anarlog-event` | Event name |
| `x-anarlog-delivery` | Unique delivery ID |
| `x-anarlog-timestamp` | Unix timestamp (seconds). Not part of the signature |
| `x-anarlog-signature` | `sha256=<hex>`, HMAC-SHA256 of the raw body |

## Delivery and Retries

Meeting event deliveries time out after 10 seconds. Failed attempts retry after 5 and 30 seconds. A `webhook.test` request makes one attempt. Store each payload `id` (or `x-anarlog-delivery`) so retries are processed once.

## Full Event Reference

See [Anarlog's webhooks reference](https://docs.anarlog.so/reference/webhooks).
