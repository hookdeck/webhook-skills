# Chatim Webhooks Overview

## What Are Chatim Webhooks?

[Chatim](https://chatim.app) is a website chat widget and chatbot builder. Webhooks send an HTTP `POST` with a JSON body to your URL when something happens in a project's chat widget: a visitor starts a chat, sends a message, submits a form, and so on. Webhooks are created per project in the Chatim dashboard, and each one has its own secret and event selection.

Typical uses: send leads to a CRM, trigger Zapier/Make workflows, notify Slack, log chat analytics, sync visitors to a database.

## Common Event Types

The event name is in the body's `event` field (and the `X-Chatim-Event` header).

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `chat.started` | A visitor opens the widget and begins a new session | Create a contact, log page and location |
| `chat.message.received` | A visitor sends a text message | Keyword routing, logging |
| `chat.form.submitted` | A visitor submits a form in the chatbot flow | Create CRM leads, send confirmation emails |
| `chat.closed` | A chat session is closed | Store transcript, measure duration |
| `chat.assigned` | A support agent joins the conversation | Notify the team |
| `chat.handoff` | The chatbot transitions from bot mode to live chat | Alert agents that a visitor needs a human |

## Event Payload Structure

Every delivery shares these fields:

```json
{
  "event": "chat.started",
  "eventId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "projectUuid": "your-project-uuid",
  "chatUuid": "visitor-chat-uuid",
  "data": { }
}
```

`data` varies by event:

- `chat.started`: `visitor` (`uuid`, `name`, `email`, `phone`), `page` (`url`, `title`), `location` (`country`, `city`), `userAgent` (`browser`, `os`, `device`)
- `chat.message.received`: `messageUuid`, `message`, `visitor`
- `chat.form.submitted`: `formNodeId`, `formName`, `fields` (e.g. `name`, `email`, `phone`, `message`), `visitor`
- `chat.closed`: `closedBy` (`agent`, `visitor`, `system` or `timeout`), `status`, `duration` (seconds), `messageCount`, `visitor` (the docs also say it includes the transcript)
- `chat.assigned`: `assignedTo` (`uuid`, `name`), `visitor`
- `chat.handoff`: `reason`, `fromNode`, `visitor`

## Request Headers

| Header | Description |
|--------|-------------|
| `X-Chatim-Signature` | `sha256=<hex>` HMAC-SHA256 signature |
| `X-Chatim-Timestamp` | Unix timestamp (seconds) of when the request was sent |
| `X-Chatim-Event` | The event type |
| `X-Chatim-Delivery-Id` | Unique delivery identifier |

## Delivery and Retries

- `2xx` is success. `4xx` is a **permanent failure** (no retry). `5xx` and timeouts (30 seconds) are retried.
- Retries happen after 1 minute, 5 minutes, 30 minutes, 2 hours and 24 hours; after the 5th retry the delivery is marked failed.
- A webhook with 10 consecutive failures is disabled automatically; re-enable it from the dashboard.
- Delivery history (event, time, HTTP status, error) is kept for 30 days.
- Use `eventId` for idempotency. Respond with a `2xx` quickly and process asynchronously.

## Full Event Reference

See [Chatim's webhook documentation](https://chatim.app/en/documentation/webhooks/).
