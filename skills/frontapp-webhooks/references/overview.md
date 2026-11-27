# Front Webhooks Overview

## What Are Front Webhooks?

Front sends webhooks to notify your application about activity in a shared inbox —
messages arriving or being sent, conversations being assigned, moved, tagged, archived,
or commented on. Instead of polling the Front API, your endpoint receives an HTTP POST
with a JSON payload each time a matching event occurs.

Front has **two** webhook systems. This skill covers **application webhooks** (the
system used by partner / Core API apps):

- **Application webhooks** — configured on a Front app. Signed with HMAC-SHA256 in the
  `X-Front-Signature` header, include an `X-Front-Request-Timestamp`, use an
  `X-Front-Challenge` subscription handshake, retry up to 3 times, and auto-disable after
  repeated failures. **This is what the examples in this skill implement.**
- **Rule webhooks** — configured as a rule action in inbox settings. Signed with
  **HMAC-SHA1** (base64) over the body only, keyed with the "API Secret" from the Webhooks
  app, 5s timeout, **no retries**. Do not conflate the two schemes.

## Common Event Types

The event name is delivered in the top-level `type` field of the payload.

| Event `type` | Triggered When | Common Use Cases |
|--------------|----------------|------------------|
| `inbound_received` | Inbound message received | Auto-triage, CRM sync, alerting |
| `outbound_sent` | Outbound message sent | Logging replies, SLA tracking |
| `conversation_moved` | Conversation moved to another inbox | Routing analytics, notifications |
| `message_delivery_failed` | Outbound message bounced / delivery failed | Bounce handling, list hygiene |
| `conversation_archived` | Conversation archived | Close-out workflows, metrics |
| `conversation_reopened` | Conversation reopened | Reopen alerts |
| `conversation_deleted` | Conversation deleted | Audit, cleanup |
| `conversation_restored` | Conversation restored | Audit, recovery |
| `conversation_snoozed` | Conversation snoozed | Follow-up scheduling |
| `conversation_snooze_expired` | Snooze expired | Follow-up reminders |
| `new_comment_added` | Comment added to a conversation | Internal collaboration hooks |
| `assignee_changed` | Assignee changed | Workload tracking, escalation |
| `tag_added` | Tag added to a conversation | Categorization, automation |
| `tag_removed` | Tag removed from a conversation | Categorization |
| `link_added` | Link added to a conversation | Cross-linking, integrations |
| `link_removed` | Link removed from a conversation | Cross-linking, integrations |

Front webhooks **exclude** "mass action" events such as moving all inbox content to
another team, mass status updates, or importing historical messages.

## Event Payload Structure

Front documents the application webhook envelope like this (its own example, with
`payload` elided):

```json
{
  "type": "inbound_received",
  "authorization": { "id": "cmp_abc" },
  "payload": { ... }
}
```

Key fields:

- **`type`** — the webhook event type your handler switches on (`inbound_received`, `conversation_moved`, `assignee_changed`, …).
- **`authorization.id`** — the Front company the event came from, so a published app can tell its customers apart.
- **`payload`** — a Front [event object](https://dev.frontapp.com/reference/events#example-event-object) with its own `id`, `type`, `emitted_at`, `source`, `target` and `conversation`.
- **`payload.id`** — the event ID. Front says event IDs are sequential and never reused, so use it for idempotency / deduplication.
- **`payload.emitted_at`** — when Front emitted the event (epoch seconds with a fraction).
- **`payload.source`** / **`payload.target`** — what caused the event and what it acted on, each with a `_meta.type` (for example `rule` and `teammate` when a rule assigns a conversation).

`payload.type` uses Front's Events API names (`assign`, `inbound`, `tag`, …), not the
webhook `type` values above. Front doesn't publish which event object types each webhook
type carries, so route on the top-level `type`.

## Full Event Reference

- [Front Webhooks](https://dev.frontapp.com/docs/webhooks-1)
- [Front Events](https://dev.frontapp.com/reference/events)
