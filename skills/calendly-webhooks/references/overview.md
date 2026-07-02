# Calendly Webhooks Overview

## What Are Calendly Webhooks?

Calendly is a scheduling platform. Webhooks let your application react in real time
when someone schedules, reschedules, or cancels an event, is marked as a no-show, or
submits a routing form. Instead of polling the Calendly API, you register a webhook
subscription and Calendly sends an HTTP `POST` to your endpoint whenever a subscribed
event occurs.

Each request is signed with the `Calendly-Webhook-Signature` header so you can verify
the payload is authentic and hasn't been tampered with or replayed. Your endpoint
should verify the signature, then return a `2xx` status code to acknowledge receipt.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `invitee.created` | An invitee schedules an event | Create CRM record, send confirmation, provision resources |
| `invitee.canceled` | An invitee cancels a scheduled event | Free up availability, trigger win-back flow, update CRM |
| `invitee_no_show.created` | An invitee is marked as a no-show | Flag account, send follow-up, adjust scoring |
| `invitee_no_show.deleted` | A no-show mark is removed | Revert no-show handling |
| `routing_form_submission.created` | A routing form is submitted | Qualify/route leads, sync to marketing tools |

## Event Payload Structure

Calendly wraps every event in a consistent envelope:

```json
{
  "event": "invitee.created",
  "created_at": "2026-07-02T12:00:00.000000Z",
  "created_by": "https://api.calendly.com/users/AAAA",
  "payload": {
    "uri": "https://api.calendly.com/scheduled_events/EVENT/invitees/INVITEE",
    "email": "invitee@example.com",
    "name": "Jane Doe",
    "status": "active",
    "scheduled_event": {
      "uri": "https://api.calendly.com/scheduled_events/EVENT",
      "name": "30 Minute Meeting",
      "start_time": "2026-07-10T15:00:00.000000Z",
      "end_time": "2026-07-10T15:30:00.000000Z"
    }
  }
}
```

Key top-level fields:

- `event` — the event type string (e.g. `invitee.created`).
- `created_at` — ISO 8601 timestamp of when the event occurred.
- `payload` — the resource affected. Shape varies by event type (invitee for
  `invitee.*`, submission for `routing_form_submission.created`).

## Full Event Reference

For the complete list of events and payload schemas, see
[Calendly's webhook subscription documentation](https://developer.calendly.com/api-docs/c1ddba8ce4a0d-webhook-subscriptions).
