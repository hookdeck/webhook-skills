# Roam Webhooks Overview

## What Are Roam Webhooks?

Roam (ro.am) is a virtual office. The v1 Webhooks API delivers real-time HTTP POST notifications to your URL when events happen in a Roam workspace. You configure a webhook on an API Key, OAuth App or Personal Access Token, choose events, and Roam posts a JSON envelope signed with the [Standard Webhooks](https://www.standardwebhooks.com/) scheme. (This is Roam HQ, not Roam Research.)

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `chat.message` | A chat message is created, edited or deleted | Chat bots, mirroring messages |
| `chat.reaction` | A reaction is added to or removed from a message | Approval flows via emoji |
| `meeting.started` | A meeting has started | Presence, notifications |
| `meeting.ended` | A meeting has ended and its transcript and summary are ready | Sync summaries and action items |
| `lobby.booked` | A lobby meeting was booked | CRM or calendar sync |
| `magicast.created` | A magicast has been created | Asset pipelines |
| `onair.event.created` | An On-Air event was created | Event syncing |

Other v1 events: `chat.link.shared`, `user.status.update`, `onair.event.updated`, `onair.event.canceled`, `onair.guest.rsvp`, `onair.guest.added`, `token.revoked`, `app.uninstalled`. v1 names are dotted; subscribing with v0 colon names (`chat:message:dm`) returns `400`.

## Event Payload Structure

```json
{
  "type": "meeting.ended",
  "eventId": "0197f9a5-4d84-7dd4-be5f-6a7b8c9d0e1f",
  "timestamp": "2026-04-21T17:52:18.000000Z",
  "apiVersion": "2026-07-07",
  "data": { "id": "a1b2c3d4-...", "title": "Weekly Team Standup", "hasVideo": true }
}
```

`type` matches the `Roam-Event-Type` header, `eventId` equals the `webhook-id` header, and the event-specific payload is under `data`. For `chat.message`, `data.version` is `1` for a new message, higher for an edit, and `data.contentType` is `"deleted"` for a delete; `(chatId, timestamp)` identifies a message across its lifecycle.

## Delivery Behaviour

- Each attempt must return a 2xx within **3 seconds**.
- Transient failures (network errors, timeouts, 429, 5xx) are retried three times: about 1 second, +1 minute and +5 minutes later. `Roam-Retry-Num` and `Roam-Retry-Reason` mark retries. Other 4xx fail immediately; `410 Gone` deletes the subscription.
- Delivery is best-effort and not a durable outbox; be idempotent.
- **One event can produce two POSTs** with the same `webhook-id`: a legacy tagged-id body (`type: "message"`) and the v1 body. Dedupe on `webhook-id` and process the v1 envelope only.
- Pin `apiVersion` to `2026-07-07` or later on subscribe to receive the envelope shown above; subscriptions on an earlier version (e.g. `2026-06-01`) get a bare payload.

## Full Event Reference

See [Roam's webhook documentation](https://developer.ro.am/docs/webhooks/webhooks) for every event and its payload schema.
