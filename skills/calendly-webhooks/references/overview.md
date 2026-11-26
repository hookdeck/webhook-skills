# Calendly Webhooks Overview

## What Are Calendly Webhooks?

Calendly is a scheduling platform. Webhooks let your application react in real time
when someone schedules, reschedules, or cancels an event, is marked as a no-show, or
submits a routing form, and when event types, contacts or meeting recaps change. Instead of polling the Calendly API, you register a webhook
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

Calendly also sends `event_type.created`, `event_type.updated`, `event_type.deleted`,
`contact.created`, `contact.updated`, `contact.deleted`, `meeting_recap.created`,
`meeting_recap.updated` and `meeting_recap.deleted` (14 events in all). A reschedule
sends both `invitee.canceled` (with `rescheduled: true` and a `new_invitee` URI) and
`invitee.created` (with an `old_invitee` URI).

## Event Payload Structure

Calendly wraps every event in a consistent envelope. An excerpt of Calendly's
documented `invitee.created` example, with most `payload` fields left out:

```json
{
  "event": "invitee.created",
  "created_at": "2020-11-23T17:51:19.000000Z",
  "created_by": "https://api.calendly.com/users/AAAAAAAAAAAAAAAA",
  "payload": {
    "uri": "https://api.calendly.com/scheduled_events/AAAAAAAAAAAAAAAA/invitees/AAAAAAAAAAAAAAAA",
    "email": "test@example.com",
    "name": "John Doe",
    "status": "active",
    "rescheduled": false,
    "scheduled_event": {
      "uri": "https://api.calendly.com/scheduled_events/AAAAAAAAAAAAAAAA",
      "name": "15 Minute Meeting",
      "start_time": "2019-08-24T14:15:22.123456Z",
      "end_time": "2019-08-24T14:15:22.123456Z"
    }
  }
}
```

Key top-level fields:

- `event` — the event type string (e.g. `invitee.created`).
- `created_at` — when the webhook payload was created (ISO 8601).
- `created_by` — the URI of the user who created the webhook subscription.
- `payload` — the resource affected. Shape varies by event type (invitee for
  `invitee.*` and `invitee_no_show.*`, submission for `routing_form_submission.created`,
  an object holding `contact` or `recap` for contact and meeting recap events).

There is no event ID in the envelope. Calendly retries failed deliveries for up to 24
hours, so deduplicate on `event` plus the resource's `uri` and `updated_at`, not the
invitee URI alone, which several invitee events share.

## Full Event Reference

For the complete list of events and their subscription scopes, see
[Calendly's Create Webhook Subscription reference](https://developer.calendly.com/api-docs/calendly-api/webhooks/create-webhook-subscription), and for every
payload schema and example, [Get sample webhook data](https://developer.calendly.com/api-docs/calendly-api/webhooks/get-sample-webhook-data).
