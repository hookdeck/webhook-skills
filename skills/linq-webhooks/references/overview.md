# Linq Webhooks Overview

## What Are Linq Webhooks?

[Linq](https://docs.linqapp.com/channel/imessage/) is a partner API for iMessage, RCS and SMS lines. This skill
covers the iMessage channel (`https://api.linqapp.com/api/partner/v3`). Linq pushes events to a **webhook
subscription**: a target URL you own, a list of `subscribed_events`, an optional `phone_numbers` filter, and
a signing secret. Every delivery is a JSON `POST` signed with
[Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks) headers.

Events cover messages, reactions, polls, chats, participants, phone numbers, calls, payments, locations,
contact cards, and account changes (API tokens, environments, subscriptions, team members).

## Common Event Types

76 event types are listed in Linq's authoritative list (the docs call it rendered from the OpenAPI spec, so
treat that spec as the source of truth). The name is `event_type` in the JSON body. The examples handle these:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `message.received` | An incoming message arrives on your line | Route inbound messages to an agent, CRM or bot |
| `message.sent` | A message was successfully sent from your line | Confirm sends, store the message ID |
| `message.delivered` | The message reached the recipient's device | Delivery receipts (never sent for SMS/MMS) |
| `message.read` | The recipient read the message | Read receipts (never sent for SMS/MMS) |
| `message.failed` | Delivery failed | Retry or alert; branch on `code` |
| `message.edited` | A message was edited (`2026-02-03` webhook version only) | Keep stored copies in sync |
| `reaction.added` | A tapback or emoji reaction was added to a message part | Engagement signals |
| `reaction.removed` | A reaction was removed | Engagement signals |
| `chat.created` | A chat was created | Track new conversations |
| `participant.added` | Someone joined a group chat | Keep group membership in sync |
| `participant.removed` | Someone left or was removed from a group chat | Keep group membership in sync |
| `phone_number.status_updated` | A line's `status` (`ACTIVE` / `FLAGGED`) or `reputation` (`HEALTHY` / `AT_RISK` / `CRITICAL`) changed | Alert on line health |

Other documented events the examples log as unhandled:

- **Messages and polls:** `poll.received`, `poll.sent`, `poll.delivered`, `poll.read`, `poll.updated`, `poll.failed`,
  `poll.vote.added`, `poll.vote.removed`, `poll.reaction.added`
- **Chats:** `chat.group_name_updated`, `chat.group_icon_updated`, `chat.group_name_update_failed`,
  `chat.group_icon_update_failed`, `chat.background_updated`, `chat.background_update_failed`,
  `chat.typing_indicator.started`, `chat.typing_indicator.stopped`
- **Phone numbers and contacts:** `phone_number.assigned`, `phone_number.released`, `phone_number.line_type_updated`,
  `phone_number.forwarding_updated`, `contact_card.received`, `contact_card.created`, `contact_card.updated`,
  `contact_card.deleted`
- **Calls:** `call.initiated`, `call.ringing`, `call.answered`, `call.ended`, `call.failed`, `call.declined`,
  `call.no_answer`
- **Location and payments:** `location.sharing.started`, `location.sharing.stopped`, `payment.succeeded`,
  `payment.canceled`, `payment.expired`, `payment.declined`, `payment.authorized`, `connection.created`,
  `connection.revoked`
- **Account events:** `zero_day_retention.updated`, `environment.line_moved`, `environment.created`,
  `environment.renamed`, `environment.deleted`, `api_token.created`, `api_token.renamed`,
  `api_token.expiry_scheduled`, `api_token.expired`, `api_token.activated`, `api_token.deleted`,
  `webhook_subscription.created`, `webhook_subscription.deleted`, `webhook_subscription.target_url_changed`,
  `webhook_subscription.enabled`, `webhook_subscription.disabled`, `webhook_subscription.events.updated`,
  `webhook_subscription.phone_numbers.updated`, `webhook_subscription.routing_headers_set`,
  `webhook_subscription.routing_headers_cleared`, `team_member.added`, `team_member.signed_in`,
  `team_member.signed_out`

Account events carry `summary`, `occurred_at`, `actor` and `origin` in `data`, can arrive out of order (order by
`data.occurred_at`), and ignore a subscription's `phone_numbers` filter.

## Event Payload Structure

Every delivery shares one envelope:

```json
{
  "api_version": "v3",
  "webhook_version": "2026-02-03",
  "event_type": "message.received",
  "event_id": "2915e81c-5068-4796-ace2-21d2c94ad298",
  "created_at": "2026-02-05T19:31:13.736Z",
  "trace_id": "8af9171a45022df2eb74ba4e4c83be0f",
  "partner_id": "your-partner-id",
  "data": { }
}
```

| Field | Description |
|-------|-------------|
| `api_version` | API version (`v3`) |
| `webhook_version` | Payload version, `2025-01-01` or `2026-02-03` (see below) |
| `event_type` | Event type string. The deprecated `X-Webhook-Event` header carries the same value |
| `event_id` | Unique event ID. **Use it for deduplication**: it is the same on retries and across subscriptions |
| `created_at` | When the event was created |
| `trace_id` | Trace ID for debugging and support requests |
| `partner_id` | Your partner identifier |
| `data` | The event-specific payload |

Payload shapes differ by event. In `2026-02-03` payloads, `message.received` and `message.sent` carry the
message at `data.id` with a nested `data.chat`, `sender_handle` and `parts[]`. `message.failed` and the
reaction events carry flat `chat_id` and `message_id`. `phone_number.status_updated` has `phone_number`,
`previous_status`, `new_status`, `previous_reputation`, `new_reputation` and `changed_at`.

## Webhook Versions

Payloads are versioned by date. Add `?version=YYYY-MM-DD` to the subscription's `target_url`. Subscriptions
created before 2026-02-03 use `2025-01-01`; later ones use `2026-02-03`. With no version, the latest version
at creation time applies. Pin it explicitly to avoid payload changes. Keep the query string on the
registered URL: it is part of the URL Linq calls, and your route still sees the same path.

## Delivery Behavior

| Property | Value |
|----------|-------|
| Response timeout | 10 seconds |
| Retries | About 10 attempts, exponential backoff with jitter, capped at 10 minutes, within 30 minutes of the event's creation |
| Retried | HTTP 5xx, 429, timeouts, refused connections, redirect loops, `3xx` without `Location` |
| Not retried | Other 4xx, DNS failures, invalid hostnames, redirects from `https://` to `http://` |
| Delivery model | At-least-once, so duplicates are possible |
| Ordering | Not guaranteed for account events |

Return `2xx` quickly and process asynchronously. Don't redirect the endpoint: a `301`/`302`/`303` is followed
as a body-less `GET`, so the delivery may count as successful without you receiving the event. Register the
final `https://` URL.

SMS and MMS sends never produce `message.delivered` or `message.read`. You still get `message.sent` and
`message.failed`.

## Full Event Reference

For payload schemas of every event, see Linq's
[Webhook Events](https://docs.linqapp.com/channel/imessage/guides/webhooks/events/) and
[Webhooks](https://docs.linqapp.com/channel/imessage/guides/webhooks/) guides, or the OpenAPI spec at
`https://cdn.linqapp.com/openapi/linq-api-v3.yaml`.
