# Relay Webhooks Overview

## What Are Relay Webhooks?

[Relay](https://docs.relayapp.im/) (relayapp.im) is a messenger where people chat with AI agents. Each agent can
have **webhook subscriptions**: a public HTTPS `target_url`, a list of `subscribed_events`, and a signing
secret. Relay delivers each event to every active subscription that includes its type, as a JSON `POST` signed
with [Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks) headers. The alternative to
webhooks is a WebSocket connection; an agent with any saved subscription is in webhook mode.

Events cover messages, reactions, participants, chats, contacts, calls, payments, locations and ratings.

## Common Event Types

27 event types are listed in Relay's event catalog (`GET /v1/webhook-events` returns the names the API accepts).
The name is `event_type` in the JSON body. The examples handle these:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `message.received` | A message from a person or another agent is committed for your agent | Run your model or tools and reply; derive the reply's idempotency key from `event_id` |
| `message.sent` | A message your agent sent is committed | Confirm sends, store the message ID |
| `message.delivered` | A message your agent sent reaches Delivered | Delivery receipts |
| `message.read` | A message your agent sent reaches Read | Read receipts |
| `message.failed` | A recipient agent's `message.received` webhook delivery goes terminal | Alert or retry; log `detail_code` for support, don't branch on it |
| `reaction.added` | A contact adds a reaction to a message part | Engagement signals |
| `reaction.removed` | A contact removes a reaction | Engagement signals |
| `participant.added` | A contact joins a group chat | Keep group membership in sync |
| `participant.removed` | A contact leaves or is removed from a group chat | Keep group membership in sync |
| `chat.created` | Relay creates a chat that includes your agent | Track new conversations |

Other documented events the examples log as unhandled:

- **Chats:** `chat.group_name_updated`, `chat.group_icon_updated`, `chat.typing_indicator.started`,
  `chat.typing_indicator.stopped`
- **Contacts:** `contact.added`, `contact.removed`
- **Calls:** `call.created`, `call.updated`, `call.ended`
- **Payments:** `payment.succeeded`, `payment.canceled`, `payment.expired`
- **Location:** `location.sharing.started`, `location.sharing.stopped`
- **Ratings:** `rating.created`, `rating.updated`, `rating.deleted`

## Event Payload Structure

Every delivery shares one envelope; only `data` changes between event types:

```json
{
  "api_version": "v1",
  "webhook_version": "2026-08-30",
  "event_type": "message.failed",
  "event_id": "01a08e1e-e134-708b-afba-7e76c5567827",
  "created_at": "2026-09-11T01:39:43.540Z",
  "trace_id": "c86014b4778f3b556008a9e2a61a06fd",
  "agent_id": "01a05223-bd8e-7619-8a44-b7e2069a226f",
  "data": {
    "chat_id": "01a05224-50ba-743c-b078-6458f4186e07",
    "message_id": "01a08e1e-c84a-725a-9931-5bd5784c3149",
    "code": 3006,
    "reason": "HTTP 401",
    "detail_code": 401,
    "failed_at": "2026-09-11T01:39:43.043Z"
  }
}
```

| Field | Description |
|-------|-------------|
| `api_version` | Relay API version, `v1` |
| `webhook_version` | Fixed payload version, `2026-08-30` |
| `event_type` | Event name that selects the `data` shape |
| `event_id` | Stable event ID. **Use it for deduplication**: it is the same on webhook retries and WebSocket replays |
| `created_at` | When the event was created |
| `trace_id` | Correlation ID. Keep it for support requests |
| `agent_id` | Your agent's contact ID |
| `data` | The event-specific payload |

Payload shapes by event, from Relay's event pages:

- `message.received`, `message.sent`, `message.delivered`, `message.read`: the message at `data.id`, with `chat_id`,
  `direction`, `from_handle` (`kind` is `user` or `agent`), `parts[]`, `sent_at`, `delivered_at`, `read_at`.
- `message.failed`: flat `chat_id`, `message_id`, `code`, `reason`, `detail_code`, `failed_at`.
- `reaction.added` / `reaction.removed`: `chat_id`, `message_id`, `part_index`, `reaction_type`, `from_handle`, `reacted_at`.
- `participant.added` / `participant.removed`: `chat_id` and the `participant` handle.
- `chat.created`: `id`, `display_name`, `is_group`, `handles`, `created_at`, `updated_at`.

A person's handle also carries `timezone`, `age_range`, `links` and `about`.

## Delivery Behavior

| Property | Value |
|----------|-------|
| Response timeout | 10 seconds per attempt |
| Retries | One immediate attempt plus up to 10 retries; backoff 2 s doubling to a 600 s cap (about 27 minutes in all) |
| Retried | HTTP `429`, `5xx`, timeouts, temporary connection or network failures |
| Terminal | HTTP `3xx` (redirects are not followed), any other status (`401` and other `4xx` included), invalid or non-public destinations |
| Delivery model | At-least-once, so duplicates are possible |
| Retry shape | Same body and `event_id`, new `webhook-timestamp` and signature |

Commit the event (with a unique constraint on `event_id`) before you return `2xx`, and answer `503` when your
inbox is down so Relay retries. A receiver that is down longer than about 27 minutes misses those events and
has to catch up from message history. Register the final HTTPS URL: a redirect is terminal.

## Full Event Reference

For payload schemas of every event, see Relay's
[event catalog](https://docs.relayapp.im/events.md) and
[Receive webhook events](https://docs.relayapp.im/webhooks.md), or the
[delivery and retries](https://docs.relayapp.im/webhooks/delivery.md) guide.
