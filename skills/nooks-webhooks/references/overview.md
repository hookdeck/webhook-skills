# Nooks Webhooks Overview

## What Are Nooks Webhooks?

Nooks is an AI sales dialer. Its call logging webhooks stream call data to your own systems in real time, so you can sync calls to a CRM or sales engagement platform Nooks doesn't integrate with natively, load them into a data warehouse, or trigger internal workflows (Slack notifications, dashboards, sequence enrolment). You add a URL under **Integrations → Webhooks** in Nooks settings and subscribe to the `call.logged` event. All events are sent as HTTP `POST` with `Content-Type: application/json`.

## Common Event Types

Nooks documents one event:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `call.logged` | A call is fully finalized in Nooks | Log the call to a CRM, warehouse load, notify a channel, enrol a prospect |

## Event Payload Structure

Top-level fields:

| Field | Type | Notes |
|-------|------|-------|
| `event` | string | Always `call.logged` for this webhook |
| `eventId` | string | Unique per **delivery attempt**: changes on every retry. Logging only |
| `occurredAt` | string | ISO 8601, when the event was finalized |
| `callData` | object | Everything about the call |

`callData` fields: `callId` (permanent; the idempotency key), `workspaceId`, `status` (e.g. `completed`), `userData` (`userId`, `email`, `name`), `prospectData` (`prospectId`, `name`, `phoneNumber`, `email`, `linkedInUrl`), `accountData` (`accountId`, `name`), `callDirection` (`inbound` or `outbound`), `disposition` (`id`, `name`), `startedAt`, `durationSeconds`, `recordingUrl`, `notes`, `transcriptUrl`, and `sequenceData` (`sequenceName`, `sequenceStep`, or `null` when the call wasn't made from a sequence). `email`, `linkedInUrl`, `recordingUrl`, `notes` and `transcriptUrl` can be `null`.

```json
{
  "event": "call.logged",
  "eventId": "ed573041-57e9-4ef6-9976-bb759761c2a7-#-22216d73-1351-4e4b-ae0c-64d7fc46b8c1",
  "occurredAt": "2025-12-09T04:06:36.145Z",
  "callData": {
    "callId": "ed573041-57e9-4ef6-9976-bb759761c2a7",
    "workspaceId": "cUvwa9fcNtE1G7vy",
    "status": "completed",
    "callDirection": "inbound",
    "disposition": { "id": "test-disposition-id", "name": "test-disposition-name" },
    "startedAt": "2025-12-09T02:54:29.170Z",
    "durationSeconds": 100
  }
}
```

(Abridged: see the full field list above.)

## Delivery, Retries, and Idempotency

- Respond with a 2xx within **15 seconds**. Verify, enqueue, respond, then process.
- A non-2xx or a timeout is retried with exponential backoff and jitter, up to 8 attempts over 30 minutes.
- Retries mean the same call can arrive more than once. De-duplicate on `callData.callId`, **not** `eventId`.

## Full Event Reference

See [Nooks's webhook documentation](https://nooks.help.usepylon.com/articles/8109690071-nooks-webhooks-integration-guide).
