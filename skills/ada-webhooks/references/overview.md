# Ada Webhooks Overview

## What Are Ada Webhooks?

[Ada](https://www.ada.cx) is an AI customer service platform. Its webhooks notify your systems in real time when conversations start, messages are sent, conversations or handoffs end, end user profiles change, configuration changes are audited, and Voice Proactive Outreach calls change state.

Ada delivers webhooks through [Svix](https://www.svix.com): deliveries are signed with Svix headers, can be filtered with Svix channel tags, come from Svix source IPs, and can be tested with Svix Play. You manage endpoints in **Config > PLATFORM > Webhooks** or with the Webhooks API (`/api/v2/webhooks/`).

## Which Ada Webhook Events Are There?

| Event | Triggered when | Common use cases |
|-------|----------------|------------------|
| `v1.conversation.created` | A new conversation is created for a supported channel | Open a ticket, start analytics tracking |
| `v1.conversation.message` | A new message is added to a supported channel | Mirror transcripts, relay messages on a custom channel |
| `v1.conversation.ended` | A conversation ends, via `POST /v2/conversations/{conversation_id}/end/` or when a Voice call disconnects | Close tickets, trigger CSAT surveys, archive transcripts |
| `v1.conversation.handoff.ended` | A handoff to a human agent integration ends | Hand control back to the AI Agent, update agent workload |
| `v1.end_user.created` | A new user is created through any of Ada's supported channels | Create or link a CRM contact |
| `v1.end_user.updated` | A value on the end user's profile changes | Sync profile changes to your CRM |
| `v1.audit_log.emitted` | A configuration change is recorded in the Audit log | Compliance logging, change alerts |
| `v1.proactive_call.queued` | A Voice Proactive Outreach call request is accepted and queued | Track outreach campaigns |
| `v1.proactive_call.initiated` | The outbound call is placed with the carrier | Call progress dashboards |
| `v1.proactive_call.answered` | A person answers the call and its conversation exists | Link the call to its `conversation_id` |
| `v1.proactive_call.machine_detected` | A voicemail system or answering machine answers. No conversation is created | Schedule a retry |
| `v1.proactive_call.failed` | The call ends without a person answering; `failure_reason` says why | Retry, fix numbers, raise capacity |

`v1.conversation.handoff.ended` has its own reference page but isn't in the overview table of Ada's webhook docs. The `v1.proactive_call.*` events need [Voice Proactive Outreach](https://docs.ada.cx/docs/automation/proactive-outreach/voice). Call `GET /api/v2/webhooks/event-types/` for the event types available to your AI Agent.

## What Does an Ada Webhook Payload Look Like?

Every event has the same envelope:

```json
{
  "type": "v1.conversation.created",
  "timestamp": "2026-10-21T09:30:00.123Z",
  "data": {
    "conversation_id": "5f7e0e2c1a2b3c4d5e6f7a8b",
    "channel_id": "5df263b7db5a7e6ea03fae9b",
    "created_at": "2026-10-21T09:30:00Z",
    "end_user_id": "5f7e0e2c1a2b3c4d5e6f7a8c",
    "metadata": {},
    "ai_agent_domain": "example.ada.support"
  }
}
```

- `type`: the event type string from the table above.
- `timestamp`: when the event was generated, with millisecond precision for ordering.
- `data`: event-specific fields. Conversation events carry `conversation_id`, `end_user_id` and `ai_agent_domain`.
- `tags`: only on `v1.end_user.*` (includes `end_user_id`) and `v1.audit_log.emitted` (includes `entity_type`, `activity`, `entity_id`).

There's **no top-level event ID**. Use the `svix-id` header to dedupe: it stays the same across retries of the same message.

Event-specific fields:

- `v1.conversation.message`: `message_id`, `author.role` (`end_user`, `ai_agent`, `human_agent`), `content.type` (`text`, `link`, `file`, `quick_replies`), `channel`, and `handoff_integration` (null when the message goes to the AI Agent).
- `v1.conversation.ended`: `ended_by.role` (`end_user`, `system`, `human_agent`), `created_at`, `updated_at`.
- `v1.conversation.handoff.ended`: `handoff_integration` (for example `salesforce`, `zendesk_chat`).
- `v1.end_user.*`: `end_user_id`, `external_id`, `profile` (name, email, language, metadata).
- `v1.audit_log.emitted`: `id`, `entity_type`, `entity_id`, `activity` (`created`, `updated`, `deleted`, `executed`, `invited`, `activated`, `deactivated`), actor fields. Delivery is best effort; the Audit log pull API is the durable record.
- `v1.proactive_call.*`: `proactive_attempt_id`, `proactive_id`, `state`, `recipient.phone_number`, `conversation_id` (from `answered` on), `failure_reason` (only on `failed`). These events can arrive out of order.

## How Does Ada Deliver and Retry Webhooks?

- Your endpoint must return a `2xx` within **15 seconds**.
- Failed attempts are retried immediately, then after 5 seconds, 5 minutes, 30 minutes, 2 hours, 5 hours and 10 hours (up to 2 attempts).
- If every attempt to an endpoint fails for **one week**, the endpoint is disabled. Re-enable it in the Webhooks UI.
- You can resend single messages or **Recover Failed Messages** from a point in time on the endpoint page.

## Full Event Reference

See [Ada's webhook documentation](https://docs.ada.cx/reference/webhooks/overview) and the per-event pages linked from it.
