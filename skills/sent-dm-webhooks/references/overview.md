# Sent Webhooks Overview

## What Are Sent Webhooks?

[Sent](https://sent.dm) (sent.dm) is a multi-channel messaging API (SMS, WhatsApp, RCS, voice). A webhook is an HTTPS endpoint you register; Sent POSTs a signed JSON event to it whenever something you subscribed to happens. As a message moves through `queued → routed → sent → delivered → read` (or `failed`), and when a recipient replies, each step is an event. Sender Profiles can receive clones of your organization's webhook, using your URL and signing secret.

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

`field` is the parent family, `event` is the granular type and the value to dispatch on. Some events add a top-level `request_id`. The `X-Webhook-Event-Type` header holds the same event name.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `message.delivered` | Message reached the recipient's device | Mark an order notification delivered |
| `message.failed` | Delivery failed (`reason_code`, `reason`) | Alert, retry on another channel |
| `message.received` | A contact sent an inbound message (`text`, `inbound_number`) | Conversation inbox, keyword handling |
| `templates.approved` / `templates.rejected` | A template finished review (`template_name`, `status`) | Enable or fix a template |
| `contact.opt_out` | A contact opted out (`source`, e.g. `INBOUND_KEYWORD`) | Update consent records |
| `channel.activated` | A sender channel registration became active (`channel`, `sender_value`) | Start sending from a new sender |

## All Documented Event Types (38)

| Family | Events |
|--------|--------|
| `message` | `message.queued`, `message.routed`, `message.sent`, `message.delivered`, `message.read`, `message.failed`, `message.scheduled`, `message.cancelled`, `message.filtered`, `message.blocked`, `message.received` |
| `templates` | `templates.pending`, `templates.approved`, `templates.rejected`, `templates.paused`, `templates.disabled`, `templates.deleted`, `templates.category_updated`, `templates.quality_updated` |
| `channel` | `channel.submitted`, `channel.changes_requested`, `channel.approved`, `channel.rejected`, `channel.activated`, `channel.deactivated` |
| `contact` | `contact.opt_in`, `contact.opt_out`, `contact.help`, `contact.custom_keyword` |
| `link` | `link.created`, `link.requested`, `link.clicked`, `link.downloaded`, `link.expired`, `link.revoked`, `link.purged`, `link.tags_changed` |
| `call` | `call.request`, `call.initiated`, `call.answered`, `call.completed`, `call.failed`, `call.recording_ready` |

Check the events reference for the current list: Sent adds types over time, so always keep a `default` branch that logs and returns `2xx`.

## Payload Fields

Outbound `message.*` events (`payload`): `message_id`, `account_id`, `updated_at`, `template_id`, `template_name`, `outbound_number` (recipient, E.164), `message_status`, `channel` (`sms`, `mms`, `whatsapp`, `rcs`), `body` (plain text or `null`), plus `reason_code` / `reason` on `failed`, `filtered` and `blocked`. `message.received` carries `inbound_number`, `outbound_number`, `text`, `channel`, `received_at`. Template events carry `template_id`, `template_name`, `status`, `language`, `category`, `channel`.

## Delivery Headers

| Header | Description |
|--------|-------------|
| `X-Webhook-ID` | UUID of the webhook configuration (same for every event) |
| `X-Webhook-Event-ID` | UUID of the event, identical on every attempt. The dedupe key |
| `X-Webhook-Timestamp` | Unix seconds when this attempt was signed |
| `X-Webhook-Attempt` | Attempt index, starting at `1` |
| `X-Webhook-Signature` | `v1,<base64 HMAC-SHA256>` |
| `X-Webhook-Event-Type` | Fully qualified event type |

## Retries and Auto-Disable

A non-2xx response, a timeout (per webhook 5-120 s, default 30 s) or a connection failure fails the attempt. Failed events are retried up to `retry_count` times (1-5, default 3): the first retry about a minute later, the delay doubling up to 60 minutes. After 10 consecutive failed events the webhook is disabled until you re-enable it in the dashboard. A failed test delivery doesn't count and makes a single attempt.

## Full Event Reference

For the complete payloads, see [Sent's events reference](https://docs.sent.dm/start/webhooks/event-types).
