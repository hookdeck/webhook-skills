# Sent Webhooks Overview

## What Are Sent Webhooks?

[Sent](https://sent.dm) (sent.dm) is a multi-channel messaging API (SMS, WhatsApp, RCS, voice). A webhook is an HTTPS endpoint you register; Sent POSTs a signed JSON event to it whenever something you subscribed to happens. As a message moves through `queued → routed → sent → delivered → read` (or `failed`), and when a recipient replies, each step is an event. Your organization's webhook can also receive its Sender Profiles' events: a version 2 webhook with `is_inheritable` receives each profile's events once, and a version 1 webhook is cloned onto each profile with `sender_profile`.

Docs: [Building the webhook receiver](https://docs.sent.dm/build/webhook-receiver), [Events reference](https://docs.sent.dm/start/webhooks/event-types).

## Event Envelope

```json
{
  "field": "message",
  "event": "message.delivered",
  "timestamp": "2025-10-31T10:10:42Z",
  "payload": { "...": "family-specific fields" }
}
```

`field` is the parent family, `event` is the granular type and the value to dispatch on. Some events add a top-level `request_id`. On version 1 the `X-Webhook-Event-Type` header holds the same event name; version 2 has no event-type header.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `message.delivered` | Message reached the recipient's device | Mark an order notification delivered |
| `message.failed` | Delivery failed (`reason_code`, `reason`) | Alert, retry on another channel |
| `message.received` | A contact sent an inbound message (`text`, `inbound_number`) | Conversation inbox, keyword handling |
| `templates.approved` / `templates.rejected` | A template finished review (`template_name`, `status`) | Enable or fix a template |
| `contact.opt_out` | A contact opted out (`source`, e.g. `INBOUND_KEYWORD`) | Update consent records |
| `channel.activated` | A sender channel registration became active (`channel`, `sender_value`) | Start sending from a new sender |

## All Subscribable Event Types (39)

| Family | Events |
|--------|--------|
| `message` | `message.queued`, `message.routed`, `message.sent`, `message.delivered`, `message.read`, `message.failed`, `message.scheduled`, `message.cancelled`, `message.filtered`, `message.blocked`, `message.received` |
| `templates` | `templates.pending`, `templates.approved`, `templates.rejected`, `templates.paused`, `templates.disabled`, `templates.deleted`, `templates.category_updated`, `templates.quality_updated` |
| `channel` | `channel.submitted`, `channel.changes_requested`, `channel.approved`, `channel.rejected`, `channel.activated`, `channel.deactivated`, `channel.removed` |
| `contact` | `contact.opt_in`, `contact.opt_out`, `contact.help`, `contact.custom_keyword` |
| `link` | `link.clicked`, `link.downloaded`, `link.expired`, `link.revoked` |
| `call` | `call.initiated`, `call.answered`, `call.completed`, `call.failed`, `call.recording_ready` |

Sent says `link.created`, `link.requested`, `link.tags_changed` and `link.purged` exist only in its link analytics and are never delivered to a webhook. `call.request` is the question Sent sends to your number's callback URL, not a webhook event. Calls answered by a voice agent (a preview feature) also send `call.agent_connected`.

Check the events reference for the current list: Sent adds types over time, so always keep a `default` branch that logs and returns `2xx`.

## Payload Fields

Outbound `message.*` events (`payload`): `message_id`, `account_id`, `updated_at`, `template_id`, `template_name`, `outbound_number` (recipient, E.164), `message_status`, `channel` (`sms`, `mms`, `whatsapp`, `rcs`), `body` (plain text or `null`), plus `reason_code` / `reason` on `failed`, `filtered` and `blocked`. `message.received` carries `inbound_number`, `outbound_number`, `text`, `channel`, `received_at`. Template events carry `template_id`, `template_name`, `status`, `language`, `category`, `channel`.

## Delivery Headers

Version 2 (the default) sends the Standard Webhooks headers:

| Header | Description |
|--------|-------------|
| `webhook-id` | ID of the message, identical on every attempt. The dedupe key |
| `webhook-timestamp` | Unix seconds when this attempt was signed |
| `webhook-signature` | One or more space-separated `v1,<base64 HMAC-SHA256>` signatures |

Version 1 sends:

| Header | Description |
|--------|-------------|
| `X-Webhook-ID` | UUID of the webhook configuration (same for every event) |
| `X-Webhook-Event-ID` | UUID of the event, identical on every attempt. The dedupe key |
| `X-Webhook-Timestamp` | Unix seconds when this attempt was signed |
| `X-Webhook-Attempt` | Attempt index, starting at `1` |
| `X-Webhook-Signature` | `v1,<base64 HMAC-SHA256>` |
| `X-Webhook-Event-Type` | Fully qualified event type |

## Retries and Auto-Disable

A non-2xx response, a timeout or a connection failure fails the attempt.

- **Version 2:** retried after 5 seconds, 5 minutes, 30 minutes and 2 hours, 5 attempts over about 2.6 hours, then the event is `FAILED`. If every delivery keeps failing for an hour after the first event runs out of retries, Sent turns the webhook off and emails you. `retry_count` and `timeout_seconds` are ignored.
- **Version 1:** the timeout is per webhook (5-120 s, default 30 s), and failed events are retried up to `retry_count` times (1-5, default 3): the first retry about a minute later, the delay doubling up to 60 minutes. After 10 consecutive failed events the webhook is disabled until you re-enable it in the dashboard.

A failed test delivery doesn't count toward auto-disable and makes a single attempt.

## Full Event Reference

For the complete payloads, see [Sent's events reference](https://docs.sent.dm/start/webhooks/event-types).
