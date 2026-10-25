# Jamie Webhooks Overview

## What Are Jamie Webhooks?

Jamie ([meetjamie.ai](https://www.meetjamie.ai)) produces AI meeting notes. A webhook is an HTTPS endpoint you register in Settings → Integrations → Webhooks. Jamie sends it a `POST` with a JSON body when a meeting has been fully processed. Webhooks need a Plus plan or higher. A **personal** webhook fires only for your own meetings; a **workspace** webhook fires for every meeting in the workspace and needs workspace admin access.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `meeting.completed` | A meeting is fully processed | Push the summary to a CRM or wiki, create tasks from action items, store the transcript |

`meeting.completed` is the only event Jamie currently supports. The event name is in `metadata.event` and in the `jamie-event` header.

## Request Headers

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |
| `user-agent` | `Jamie-Webhooks/1.0` |
| `x-jamie-signature` | `t=<unix seconds>,v0=<hex>` (Signature Verification mode) |
| `jamie-event` | `meeting.completed` |
| `jamie-delivery` | Unique delivery ID |

## Event Payload Structure

```json
{
  "metadata": { "id": "7893456789012345678", "event": "meeting.completed", "created": 1701234567 },
  "data": {
    "title": "Q4 Planning Meeting",
    "startTime": "2024-11-27T14:00:00.000Z",
    "endTime": "2024-11-27T15:00:00.000Z",
    "user": { "id": "user-456", "email": "sarah.johnson@example.com" },
    "summary": { "markdown": "# Meeting Summary ...", "html": "<h1>Meeting Summary</h1>...", "short": "One-line summary" },
    "transcript": [{ "speakerId": "1", "speakerName": "Sarah Johnson", "text": "Hi everyone!" }],
    "participants": [{ "id": "1", "name": "Sarah Johnson", "email": "sarah.johnson@example.com" }],
    "event": { "id": "...", "externalId": "...", "title": "...", "scheduledTime": "...", "endTime": "...", "attendees": [] },
    "tasks": [{ "content": "Schedule follow-up", "completed": false, "assignee": null }],
    "tags": [{ "name": "Planning", "color": "#4A90D9" }]
  }
}
```

- `metadata.id` is the delivery ID. Retries can send the same delivery again, so dedupe on it.
- `participants` are the people who spoke; `event.attendees` are the people invited to the calendar event.
- `data.event` is calendar data and its fields can be `null` when the meeting isn't linked to a calendar event.

## Delivery and Retries

Return any `2xx` within 30 seconds. Otherwise Jamie retries with backoff (10 s, 60 s, 10 min, 1 h; five attempts in all), then moves the delivery to a dead-letter queue and emails the webhook owner.

## Full Event Reference

See [Jamie's webhook documentation](https://docs.meetjamie.ai/developers/webhooks/getting-started).
