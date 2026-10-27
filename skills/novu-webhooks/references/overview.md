# Novu Webhooks Overview

## What Are Novu Webhooks?

[Novu](https://novu.co) is an open-source notification infrastructure platform. Its outbound
webhooks send your server a `POST` with a JSON body whenever something happens in your Novu
account: a message is sent, delivered, read or fails, a subscriber changes a preference, a
workflow is created or published, or an inbound email arrives on a verified domain.

Novu delivers them through [Svix](https://www.svix.com/), which implements Standard Webhooks.
Each request carries `webhook-id`, `webhook-timestamp` and `webhook-signature` headers. Your
endpoint acknowledges with any `2xx`.

"Novu outbound webhooks are available on the Team and Enterprise plans."

## How Do I Tell Which Event I Received?

Every body uses the same envelope. The event name is the top-level `type`. The top-level `object`
is only the resource kind (`message`, `workflow`, `preference` or `email_inbound`), not the event.

| Field | Description |
|-------|-------------|
| `id` | Unique event ID, prefixed `evt_` |
| `type` | Event type, for example `message.sent` |
| `object` | Resource kind: `message`, `workflow`, `preference` or `email_inbound` |
| `timestamp` | ISO timestamp of when the event occurred |
| `environmentId` | The Novu environment the event belongs to |
| `data` | Always has `object` (the resource itself); update events add `previousObject` |

```json
{
  "id": "evt_67f8a1b2c3d4e5f6a7b8c9d0",
  "type": "message.sent",
  "object": "message",
  "timestamp": "2026-06-30T12:00:01.000Z",
  "environmentId": "development",
  "data": { "object": { "_id": "message_id", "subscriberId": "subscriber_123", "channel": "email", "status": "sent" } }
}
```

## Common Event Types

17 event types are documented (the list may not be exhaustive, so return `200` for unknown ones).
The examples handle all of them.

| Event | Triggered When | `data.object` |
|-------|----------------|---------------|
| `message.sent` | Novu hands the message to the delivery provider | Message (`_id`, `subscriberId`, `channel`, `providerId`, `status`) |
| `message.delivered` | The provider acknowledged delivery to the end client | Message |
| `message.failed` | Sending to the provider failed | Message; `data.error` may add `message` and `push.reason` |
| `message.seen` | A subscriber opens a message | Message |
| `message.read` | A subscriber reads a message | Message |
| `message.unread` | A message is marked unread | Message |
| `message.archived` | A subscriber archives a message | Message |
| `message.unarchived` | An archived message is unarchived | Message |
| `message.snoozed` | A subscriber snoozes a message | Message (`snoozedUntil`) |
| `message.unsnoozed` | A subscriber unsnoozes a message | Message |
| `message.deleted` | A message is deleted | Message |
| `email.received` | Inbound email matches a Webhook route on a verified domain | `domain`, `route`, `mail` (from, to, subject, text, html, attachments) |
| `preference.updated` | A subscriber preference changes | Preference (`level`, `enabled`, `channels`); the subscriber is `data.subscriberId` |
| `workflow.created` | A workflow is created | Workflow response (`workflowId`, `name`, `steps`, ...) |
| `workflow.updated` | A workflow is updated | Workflow response; `previousObject` is the stored workflow |
| `workflow.published` | A workflow is synced from dev to prod | Workflow response; `previousObject` is the one before the sync |
| `workflow.deleted` | A workflow is deleted | Stored workflow (`_id`, internal field names) |

Message payloads use Mongo-style names (`_id`, `_templateId`, `_notificationId`). Secrets in
`channelData` (such as `token`) are redacted before delivery.

## Delivery and Retries

- Any non-2xx response, or no response within 15 seconds, counts as a failure.
- Retries run immediately, then after 5 seconds, 5 minutes, 30 minutes, 2 hours, 5 hours, 10
  hours and another 10 hours.
- An endpoint that fails for 5 consecutive days is disabled and must be re-enabled by hand.
- You can resend a single failed event, recover all failed messages for a time window, or replay
  messages that were never attempted, from the dashboard.
- Retries keep the same `webhook-id`, so deduplicate on it.

## Full Event Reference

See Novu's [webhooks guide](https://docs.novu.co/platform/developer/webhooks) and
[event types](https://docs.novu.co/platform/developer/webhooks/event-types). The Event Catalog on
the dashboard's Webhooks page is generated from the same schemas Novu sends.
