# Nylas Webhooks Overview

## What Are Nylas Webhooks?

[Nylas](https://developer.nylas.com/docs/v3/notifications/webhooks/) delivers real-time
notifications about email, calendar, and contact activity across the accounts (grants)
connected to your application. Instead of polling the Email, Calendar, or Contacts APIs,
you register a **webhook destination** (an HTTPS URL) and subscribe it to one or more
**triggers**. When a matching change happens on any grant, Nylas POSTs a notification to
your endpoint.

Each webhook destination has its own **`webhook_secret`**, used to sign every request so
you can verify the notification actually came from Nylas.

## CloudEvents 1.0 Payloads

Nylas webhook payloads follow the **[CloudEvents 1.0](https://cloudevents.io/)**
specification — this is **not** Standard Webhooks. The trigger name is in the top-level
`type` field, and the changed resource lives under `data.object`.

```json
{
  "specversion": "1.0",
  "type": "message.created",
  "source": "/google/emails/realtime",
  "id": "<WEBHOOK_ID>",
  "time": 1723821985,
  "webhook_delivery_attempt": 1,
  "data": {
    "application_id": "<NYLAS_APPLICATION_ID>",
    "object": {
      "id": "<MESSAGE_ID>",
      "grant_id": "<NYLAS_GRANT_ID>",
      "object": "message",
      "subject": "Let's send an attachment"
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `specversion` | Always `"1.0"` (CloudEvents version) |
| `type` | The trigger, e.g. `message.created` |
| `source` | Origin path of the event, e.g. `/google/emails/realtime` |
| `id` | Unique notification ID — use it for **idempotency / dedupe** |
| `time` | Unix timestamp when the event occurred |
| `webhook_delivery_attempt` | Delivery attempt number (up to 5) |
| `data.application_id` | Your Nylas application ID |
| `grant_id` | The grant (connected account): in `data.object` for most types, in `data` for booking, tracking, send-result and bounce types |
| `data.object` | The changed resource (message, event, grant, etc.) |

## Common Event Types

| Trigger (`type`) | Triggered When | Common Use Cases |
|------------------|----------------|------------------|
| `message.created` | A new email is received on the grant | Inbox automation, notifications, parsing |
| `message.updated` | A message changes (read state, folder) | Sync read/unread, folder moves |
| `message.opened` | A tracked outbound message is opened | Open tracking, engagement analytics |
| `message.link_clicked` | A tracked link in a message is clicked | Click tracking, analytics |
| `message.bounce_detected` | An outbound message bounces | Suppression lists, deliverability alerts |
| `event.created` | A calendar event is created | Sync bookings, availability |
| `event.updated` | A calendar event is updated | Reschedule handling, reminders |
| `event.deleted` | A calendar event is deleted | Cancellation handling |
| `calendar.created` / `calendar.updated` / `calendar.deleted` | A calendar is created/updated/deleted | Calendar list sync |
| `grant.created` | A grant is created (account connected) | Provision user, initial sync |
| `grant.updated` | A grant is updated | Re-sync on scope change |
| `grant.expired` | A grant's credentials expire | Prompt user to re-authenticate |
| `grant.deleted` | A grant is deleted (account disconnected) | Deprovision, cleanup |
| `contact.updated` / `contact.deleted` | A contact changes | CRM sync |
| `folder.created` / `folder.updated` / `folder.deleted` | A folder/label changes | Folder mapping |
| `thread.replied` | A thread receives a reply | Conversation tracking |

## Full Event Reference

For the complete, authoritative list of triggers and their `data.object` schemas, see the
[Nylas notification schemas](https://developer.nylas.com/docs/reference/notifications/)
documentation.

## Delivery & Retries

- Nylas retries **only** on temporary errors: `408`, `429`, `502`, `503`, `504`, `507`.
- On those (and on a timeout, which is 20 seconds), it makes up to **5 attempts in total**
  with exponential backoff; the last attempt lands **10–20 minutes** after the first. Then
  the notification is dropped.
- Any other non-2xx (e.g. `400`, `401`, `500`) is **not** retried.
- If **more than 95% of deliveries fail across two consecutive 15-minute windows**, the
  webhook is marked **failing**. If that lasts **72 hours** it is marked **failed**, delivery
  stops, and you must reactivate it in the Dashboard or API.
- Delivery is **at least once** and order isn't guaranteed: dedupe on the envelope `id`,
  which stays the same across attempts.

Return `200` quickly (acknowledge, then process asynchronously) to stay healthy.
