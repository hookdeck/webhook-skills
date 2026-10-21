# Webex Webhooks Overview

## What Are Webex Webhooks?

Webex (formerly Cisco Spark) sends an HTTP POST with a JSON body to a `targetUrl` you register through the Webex Webhooks API (`POST https://webexapis.com/v1/webhooks`) whenever a subscribed activity happens. You pick a `resource` (such as `messages`) and an `event` (such as `created`), optionally narrow it with a `filter`, and optionally set a `secret` so deliveries can be signed.

Webex expects a 2xx response. If it attempts 100 deliveries within five minutes and your endpoint is unreachable or returns non-2xx, the webhook is **disabled** and is not re-enabled automatically (see [setup.md](setup.md)).

## Common Event Types

An event is the combination of the body's `resource` and `event` fields. This skill writes them as `resource.event`.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `messages.created` | A new message is posted in a room you're in | Chat bots, command handling |
| `messages.deleted` | A message is deleted from a room you're in | Audit trails, cleanup |
| `memberships.created` | Someone joins a room, or you're added to one | Welcome messages, onboarding |
| `memberships.deleted` | Someone leaves or is removed from a group room | Offboarding, access sync |
| `rooms.created` | A room is created by you or one of your integrations | Provisioning |
| `rooms.updated` | A room you're in is updated (e.g. locked/unlocked) | State sync |
| `meetings.started` | A meeting starts | Attendance, notifications |
| `meetings.ended` | A meeting ends | Follow-ups, summaries |
| `attachmentActions.created` | A user submits one of your Adaptive Cards | Interactive bots |

Other documented resources include `recordings`, `meetingParticipants` (`joined`, `left`), `meetingTranscripts`, `telephony_calls`, `convergedRecordings`, `dataSources`, `serviceApp` (`authorized`, `deauthorized`), `applications`, `adminBatchJobs` (`statusChanged`), and more. Webhooks also support `"event": "all"` (and `"resource": "all"`) firehose registrations for `messages`, `memberships`, and `rooms`, which deliver `created`, `updated`, and `deleted` events.

## Event Payload Structure

Every delivery has an envelope describing the webhook, plus a `data` object holding the resource:

```json
{
  "id": "Y2lzY29zcGFyazovL3VzL1dFQkhPT0svZjRlNjA1NjAtNjYwMi00ZmIwLWEyNWEtOTQ5ODgxNjA5NDk3",
  "name": "New message in 'Project Unicorn' room",
  "resource": "messages",
  "event": "created",
  "filter": "roomId=Y2lzY29zcGFyazovL3VzL1JPT00vYmJjZWIxYWQtNDNmMS0zYjU4LTkxNDctZjE0YmIwYzRkMTU0",
  "orgId": "OTZhYmMyYWEtM2RjYy0xMWU1LWExNTItZmUzNDgxOWNkYzlh",
  "createdBy": "Y2lzY29zcGFyazovL3VzL1BFT1BMRS9mNWIzNjE4Ny1jOGRkLTQ3MjctOGIyZi1mOWM0NDdmMjkwNDY",
  "appId": "Y2lzY29zcGFyazovL3VzL0FQUExJQ0FUSU9OL0MyNzljYjMwYzAyOTE4MGJiNGJkYWViYjA2MWI3OTY1Y2RhMzliNjAyOTdjODUwM2YyNjZhYmY2NmM5OTllYzFm",
  "ownedBy": "creator",
  "status": "active",
  "actorId": "Y2lzY29zcGFyazovL3VzL1BFT1BMRS9mNWIzNjE4Ny1jOGRkLTQ3MjctOGIyZi1mOWM0NDdmMjkwNDY",
  "data": {
    "id": "Y2lzY29zcGFyazovL3VzL01FU1NBR0UvOTJkYjNiZTAtNDNiZC0xMWU2LThhZTktZGQ1YjNkZmM1NjVk",
    "roomId": "Y2lzY29zcGFyazovL3VzL1JPT00vYmJjZWIxYWQtNDNmMS0zYjU4LTkxNDctZjE0YmIwYzRkMTU0",
    "personId": "Y2lzY29zcGFyazovL3VzL1BFT1BMRS9mNWIzNjE4Ny1jOGRkLTQ3MjctOGIyZi1mOWM0NDdmMjkwNDY",
    "personEmail": "matt@example.com",
    "created": "2015-10-18T14:26:16.000Z"
  }
}
```

Key points:

- `id` is the **webhook configuration** ID, not an event or delivery ID. Webex says not to deduplicate on it alone. Combine `resource`, `event`, and `data.id` (plus a timestamp field in `data` where one exists) to build an idempotency key.
- `actorId` is the person who caused the event (e.g. the author of a message).
- Message content is encrypted, so the `messages` webhook has **no `text`**. Fetch it with `GET https://webexapis.com/v1/messages/{data.id}` and your Bearer token.
- A bot only receives messages that mention it (in group rooms).

## Full Event Reference

For the complete list of resources, events, and filters, see [Webex's webhook documentation](https://developer.webex.com/docs/webhooks).
