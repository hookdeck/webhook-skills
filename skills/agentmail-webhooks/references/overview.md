# AgentMail Webhooks Overview

## What Are AgentMail Webhooks?

[AgentMail](https://agentmail.to) is an email API built for AI agents: you create inboxes, send and receive mail, and manage threads programmatically. Webhooks push events to your server as they happen, so an agent can react to an incoming email (`message.received`) instead of polling.

AgentMail delivers webhooks through [Svix](https://www.svix.com/). Each request is an HTTP `POST` with a JSON body, signed with the `svix-id`, `svix-timestamp` and `svix-signature` headers (see [verification.md](verification.md)).

Webhooks can be registered at the **organization**, **pod** or **inbox** level. One event can match several webhooks, and each delivery gets its own `svix-id`. That is why AgentMail tells you to deduplicate on the payload's `event_id`.

## What Does an AgentMail Webhook Payload Look Like?

Every payload shares the same envelope:

```json
{
  "type": "event",
  "event_type": "message.received",
  "event_id": "c81e728d9d4c2f636f067f89cc14862c"
  // ...one or more event-specific objects
}
```

| Field | Notes |
|-------|-------|
| `type` | Always `"event"` |
| `event_type` | The event name. Switch on this field |
| `event_id` | Identifies the event, not the delivery. Same on every retry and every webhook that receives it. Its format varies by event type (hex string, UUID, `domain.verified.example.com.1698397200000`), so treat it as opaque |

The event-specific object depends on the event:

| Event(s) | Object(s) |
|----------|-----------|
| `message.received`, `message.received.spam`, `message.received.blocked`, `message.received.unauthenticated` | `message` and `thread` (the only events that carry message content) |
| `message.sent` | `send` |
| `message.delivered` | `delivery` |
| `message.bounced` | `bounce` |
| `message.complained` | `complaint` |
| `message.rejected` | `reject` |
| `message.opened` | `open` |
| `message.security.completed`, `message.security.review`, `message.security.override` | `message` (IDs and `agent_armor` or `manual_override`, no content) |
| `domain.verified` | `domain` |
| `calendar.event.*` | `inbox_id`, `calendar_event` (and `scheduled_at` on `starting`/`ending`) |

## Which Events Does AgentMail Send?

AgentMail documents twenty event types. `event_types` is required when you create a webhook; there's no "all events" default.

### Message events

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `message.received` | A new email is received and processed in one of your inboxes | Kick off the agent workflow, reply, triage |
| `message.received.spam` | A message is received and classified as spam (not also sent as `message.received`) | Spam review queue. Opt-in; needs `label_spam_read` |
| `message.received.blocked` | A message matches a block list entry (not also sent as `message.received`) | Audit blocked senders. Opt-in; needs `label_blocked_read` |
| `message.received.unauthenticated` | A message is delivered with the `unauthenticated` label (no SPF, DKIM or DMARC pass) | Decide whether to trust the sender. Opt-in; needs `label_unauthenticated_read` |
| `message.sent` | A message has left AgentMail's servers | Record outbound mail, start follow-ups |
| `message.delivered` | The recipient's mail server accepted the message (not necessarily the inbox) | Mark as delivered |
| `message.bounced` | The message bounced. Includes `type` (e.g. `Permanent`), `sub_type` and `recipients[].address/status` | Suppress the address, alert |
| `message.complained` | A recipient marked the message as spam | Stop sending, protect reputation |
| `message.rejected` | The message was rejected before sending (`reason`) | Log, fix validation |
| `message.opened` | First open of a tracked message (needs `track_opens`, a custom domain with tracking, and an HTML body). Sent once per message | Time follow-ups |
| `message.security.completed` | [Agent Armor](https://docs.agentmail.to/agent-armor) reached a verdict, in Monitor mode | Hold the message from the agent until its verdict is in. Needs `message_read` |
| `message.security.review` | Agent Armor in Hold mode held a received message for review (`message.received` is not sent until it's released) | Alert a person. Needs `message_read` |
| `message.security.override` | Someone released a held message. May arrive before its `message.received` | Audit releases. Needs `message_read` |

### Domain events

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `domain.verified` | A custom domain is verified and ready to send | Enable sending from the domain |

### Calendar events

Every inbox has a calendar. These need the `calendar_event_read` permission. See [AgentMail's Calendar Webhooks](https://docs.agentmail.to/calendar-webhooks).

| Event | Triggered When |
|-------|----------------|
| `calendar.event.created` | A calendar event is created through the API or from a received invitation, or a date of a recurring event is edited for the first time |
| `calendar.event.updated` | A calendar event, or dates of a recurring event, change or are cancelled |
| `calendar.event.deleted` | A one-off or recurring calendar event is deleted |
| `calendar.event.responded` | The inbox responds to an invitation, or an attendee replies to one the inbox sent |
| `calendar.event.starting` | A calendar event (or one date of a recurring event) starts |
| `calendar.event.ending` | A calendar event (or one date of a recurring event) ends |

## Example Payloads

### `message.received`

```json
{
  "type": "event",
  "event_type": "message.received",
  "event_id": "c81e728d9d4c2f636f067f89cc14862c",
  "message": {
    "inbox_id": "inbox_456def",
    "thread_id": "thd_789ghi",
    "message_id": "<abc123@agentmail.to>",
    "labels": ["received"],
    "timestamp": "2023-10-27T10:00:00Z",
    "from": "Jane Doe <jane@example.com>",
    "to": ["Support Agent <support@agentmail.to>"],
    "subject": "Question about my account",
    "preview": "A short preview of the email text...",
    "text": "The full text body of the email.",
    "html": "<html>...</html>",
    "size": 2048,
    "updated_at": "2023-10-27T10:00:00Z",
    "created_at": "2023-10-27T10:00:00Z"
  },
  "thread": {
    "inbox_id": "inbox_456def",
    "thread_id": "thd_789ghi",
    "labels": ["received"],
    "subject": "Question about my account",
    "last_message_id": "<abc123@agentmail.to>",
    "message_count": 1
  }
}
```

`text` and `preview` can be missing when the email only has an HTML part (common for forwards from Gmail and Outlook). Treat `html` as the primary content and `text` as optional. Attachment content isn't included; download it through the API.

### `message.bounced`

```json
{
  "type": "event",
  "event_type": "message.bounced",
  "event_id": "6a9d2b4f-1e7c-4c3a-8f5b-9e2d7a4c1b68",
  "bounce": {
    "message_id": "<abc123@agentmail.to>",
    "timestamp": "2023-10-27T10:07:00Z",
    "type": "Permanent",
    "sub_type": "General",
    "recipients": [{ "address": "invalid@example.com", "status": "bounced" }]
  }
}
```

### `domain.verified`

```json
{
  "type": "event",
  "event_type": "domain.verified",
  "event_id": "domain.verified.example.com.1698397200000",
  "domain": { "domain_id": "dom_123abc", "status": "verified", "feedback_enabled": true, "records": [] }
}
```

## How Does AgentMail Deliver and Retry Webhooks?

- **Success:** a `2xx` within **15 seconds**. Any other status, including a redirect, or a slower response is a failure.
- **Retries:** immediately, then after 5s, 5m, 30m, 2h, 5h, 10h and 10h. That's 8 attempts over about 27.5 hours.
- **Auto-disable:** if every delivery keeps failing for 5 days, the webhook is disabled (`enabled: false`) without notification. Events that happen while it's disabled aren't redelivered. Re-enable it with `enabled: true`.
- **At least once:** dedupe on `event_id`.
- **No ordering guarantee:** order by the timestamps in the payload.
- **Missed events:** catch up with the List Messages API (`after`, `ascending=true`), the inbox events feed, or a polling webhook.

## Alternatives to Webhooks

AgentMail also offers [WebSockets](https://docs.agentmail.to/websockets) (no public URL) and [polling webhooks](https://docs.agentmail.to/webhook-polling) (events queue until your agent fetches them). This skill covers HTTP webhooks.

## Full Event Reference

- [Webhook Events](https://docs.agentmail.to/events)
- [Webhooks Overview](https://docs.agentmail.to/webhooks-overview)
- [Verifying Webhooks](https://docs.agentmail.to/webhook-verification)
