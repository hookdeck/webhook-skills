# Agntix Webhooks Overview

## What Are Agntix Webhooks?

[Agntix](https://agntix.ai) is a voice and chat AI-agent platform. Its webhooks tell your backend the moment a session (a call or a chat) starts and the moment it ends, with the post-call analysis attached. Agntix uses [Svix](https://www.svix.com/) for durable, at-least-once delivery, so every request carries Svix's `svix-id`, `svix-timestamp` and `svix-signature` headers.

## Common Event Types

Agntix documents two events that are delivered today. Its docs list the event set as growing, so handle unknown `eventType` values by acknowledging them with `200`.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `session.created` | A session is initiated. For outbound voice calls this is **before pickup** | Mark the originating task as in-flight, open a CRM activity |
| `session.ended` | A session closes (manually, on timeout, on hangup or on `ttl` expiry), once per session | Store the post-call `analysis`, update the CRM, trigger follow-ups |

Agntix's event reference also describes other events (such as `session.updated` and `knowledge_store.updated`) as **planned, not delivered as webhooks yet**. `session.updated` and `knowledge_store.updated` currently exist only as in-app real-time (SSE) signals. Don't build hard dependencies on them.

## Event Payload Structure

Session events use a **flat envelope** with no nested `data` field. The event name is the top-level `eventType`. The top-level `type` is the session kind (`VOICE` or `CHAT`), **not** the event type, and `id` is the session UUID.

```json
{
  "id": "4981804c-2658-4893-84ff-9c2fa90fb3c2",
  "eventType": "session.created",
  "type": "VOICE",
  "platform": "PHONE",
  "direction": "OUTBOUND",
  "state": "OPEN",
  "agentId": "40235145-aa3d-443e-9d0c-841dd0716a2f",
  "createdAt": "2026-04-08T05:00:01.130Z",
  "metadata": {
    "customerPhoneNumber": "+971501234567",
    "sessionVariables": { "crmContactId": "CRM-7728" }
  }
}
```

| Field | Description |
|-------|-------------|
| `id` | Session UUID. Shared by `session.created` and `session.ended` for the same session |
| `eventType` | `session.created` or `session.ended` |
| `type` | `VOICE` or `CHAT` |
| `platform` | `PHONE`, `WEB` or `WHATSAPP` |
| `direction` | `INBOUND` or `OUTBOUND` |
| `state` | `OPEN` on `session.created`, `CLOSED` on `session.ended` |
| `agentId` | Agent UUID |
| `createdAt` | RFC 3339 UTC timestamp |
| `metadata` | `customerPhoneNumber`, `roomName`, and `sessionVariables` (the `session_variables` you passed when triggering the session, echoed back verbatim) |

`session.ended` adds `lastActivityAt`, `endedAt`, `analysis` and `recordingUrl`:

```json
{
  "id": "4981804c-2658-4893-84ff-9c2fa90fb3c2",
  "eventType": "session.ended",
  "state": "CLOSED",
  "endedAt": "2026-04-08T05:00:10.546Z",
  "analysis": {
    "summary": "Customer confirmed delivery slot for Wednesday afternoon.",
    "intent": { "conversation": { "intent": "Slot-Confirmed", "confidence": 0.92 } },
    "resolution": { "classification": "RESOLVED", "confidenceScore": 0.88 },
    "sentiment": { "conversation": { "sentiment": "POSITIVE", "score": 0.4 } },
    "extractedData": { "slotConfirmed": true, "preferredDay": "Wednesday" }
  },
  "recordingUrl": "https://app.agntix.ai/en/logs-history?opened=4981804c…"
}
```

`analysis.intent`, `analysis.resolution` and `analysis.sentiment` are present only when the matching feature is enabled on the agent. `analysis.extractedData` holds one entry per field in the agent's Data Extraction schema. The webhook is summary-grade, not transcript-grade: fetch the full transcript with `GET /api/v1/chat/sessions/{id}/messages`.

## Delivery

- At-least-once delivery. Reply `2xx` within **15 seconds**; anything else is retried with exponential backoff for up to 24 hours, then dead-lettered.
- The top-level `id` is Agntix's idempotency key. It is the same for `session.created` and `session.ended`, so deduplicate on `eventType` + `id`.
- Events can arrive in any order, so correlate with the `sessionVariables` you set at trigger time (for example `crmContactId` or `taskId`).
- Endpoints must be public HTTPS URLs.

## Full Event Reference

For the complete list of events, see [Agntix's event types documentation](https://docs.agntix.ai/webhooks/events) and the [webhooks overview](https://docs.agntix.ai/webhooks/overview).
