# Agntix Webhooks Overview

## What Are Agntix Webhooks?

[Agntix](https://agntix.ai) is a voice and chat AI-agent platform. It sends an HTTPS `POST` with a
signed JSON payload to each endpoint you register when a session starts and when it ends. The end
event carries the post-call analysis. Delivery is by [Svix](https://svix.com), which follows
Standard Webhooks and uses the `svix-*` header names.

| Aspect | Value |
|--------|-------|
| Method | `POST`, JSON body |
| Signature headers | `svix-id`, `svix-timestamp`, `svix-signature` (Standard Webhooks) |
| Success | Any `2xx` within 15 seconds |
| Delivery | At least once; failures retry with exponential backoff for up to 24 hours |
| Endpoints | Public HTTPS URLs only |

## Event Payload Structure

Session events use a **flat envelope** with no nested `data` field:

```json
{
  "id": "4981804c-2658-4893-84ff-9c2fa90fb3c2",
  "eventType": "session.ended",
  "type": "VOICE",
  "platform": "PHONE",
  "direction": "OUTBOUND",
  "state": "CLOSED",
  "agentId": "40235145-aa3d-443e-9d0c-841dd0716a2f",
  "createdAt": "2026-04-08T05:00:01.130Z",
  "lastActivityAt": "2026-04-08T05:00:01.130Z",
  "endedAt": "2026-04-08T05:00:10.546Z",
  "metadata": {
    "customerPhoneNumber": "+971501234567",
    "sessionVariables": { "crmContactId": "CRM-7728" }
  },
  "analysis": { "summary": "Customer confirmed delivery slot for Wednesday afternoon." },
  "recordingUrl": "https://app.agntix.ai/en/logs-history?opened=4981804c-2658-4893-84ff-9c2fa90fb3c2"
}
```

- `eventType` is the event name (`session.created` or `session.ended`).
- `type` is the session kind, `VOICE` or `CHAT`. It is **not** the event name.
- `id` is the session UUID, the same in both events for one session. Agntix says to use it as the
  idempotency key. Because both events share it, deduplicate on `id` plus `eventType`.
- `platform` is `PHONE`, `WEB` or `WHATSAPP`; `direction` is `INBOUND` or `OUTBOUND`; `state` is
  `OPEN` on `session.created` and `CLOSED` on `session.ended`.
- `metadata` carries `customerPhoneNumber`, `roomName` and `sessionVariables`. The
  `session_variables` you passed when triggering the session come back verbatim under
  `metadata.sessionVariables`, which is how you correlate a webhook with your CRM record.

## Common Event Types

Two events are delivered today (the list may not be exhaustive).

| Event | Triggered When | Notable fields |
|-------|----------------|----------------|
| `session.created` | A session is initiated. For outbound calls this is before pickup | `id`, `type`, `platform`, `direction`, `state` (`OPEN`), `agentId`, `createdAt`, `metadata` |
| `session.ended` | A session closes (hangup, timeout, TTL expiry or manual close) | the above with `state` `CLOSED`, plus `lastActivityAt`, `endedAt`, `analysis`, `recordingUrl` |

`analysis` holds `summary`, and, only if enabled on the agent, `intent`, `resolution`
(`RESOLVED`, `PARTIALLY_RESOLVED`, `UNRESOLVED` or `NOT_APPLICABLE`), `sentiment`
(`POSITIVE`, `NEUTRAL` or `NEGATIVE`) and `extractedData` (a map of your Data Extraction fields).

`session.updated` (chat) and `knowledge_store.updated` are documented as planned. They exist only as
in-app real-time (SSE) signals and are **not** delivered to webhook endpoints. The examples handle
the two delivered events and acknowledge anything else with `200`.

## Delivery Notes

- **Persist, acknowledge, then process.** Verify, store the verified event keyed on `id` plus
  `eventType`, return `2xx`, then process asynchronously.
- **The webhook is summary-grade.** It has no message-by-message transcript, and some fields may be
  truncated for very long calls. Fetch the full transcript from the API
  (`GET /api/v1/chat/sessions/{id}/messages`) when you need it.
- Webhooks from parallel calls arrive in unpredictable order. Put a unique identifier (CRM contact
  id, task id) in `session_variables` when you trigger the session and match on
  `metadata.sessionVariables`.
- Acknowledge quickly: anything other than `2xx` within 15 seconds triggers a retry.

## Full Event Reference

See Agntix's [webhooks overview](https://docs.agntix.ai/webhooks/overview),
[event types](https://docs.agntix.ai/webhooks/events) and
[signature verification](https://docs.agntix.ai/webhooks/verify-signatures).
