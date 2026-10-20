# Cal.com Webhooks Overview

## What Are Cal.com Webhooks?

Cal.com (open-source scheduling) sends an HTTP `POST` to your **Subscriber URL** when a subscribed
**trigger** fires — a booking is created, rescheduled, cancelled, paid for, a meeting starts or ends,
a routing form is submitted, and so on. Webhooks can be set up per user, per event type, per team,
or (for some triggers) per organization, in the Cal.com app or via the API.

Each request carries:

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` (or `application/x-www-form-urlencoded` if a custom payload template is not valid JSON) |
| `X-Cal-Signature-256` | Lowercase hex HMAC-SHA256 of the raw body, or `no-secret-provided` when no secret is set |
| `X-Cal-Webhook-Version` | Payload version, e.g. `2021-10-20` or `2026-07-27` |

There is no event-type or delivery-id header: the event name is the body's `triggerEvent` field.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `BOOKING_CREATED` | A booking is confirmed | Create CRM records, send custom confirmations, provision resources |
| `BOOKING_REQUESTED` | A booking that requires confirmation is requested | Notify the host, start an approval workflow |
| `BOOKING_RESCHEDULED` | A booking is moved to a new time | Update calendars/CRM; `rescheduleUid` is the previous booking's uid |
| `BOOKING_CANCELLED` | A booking is cancelled | Release resources, refunds; read `cancellationReason` |
| `BOOKING_REJECTED` | The host rejects a requested booking | Notify the booker; read `rejectionReason` |
| `BOOKING_PAYMENT_INITIATED` | Payment for a paid event starts | Track pending payments |
| `BOOKING_PAID` | Payment for a paid event succeeds | Mark orders paid, issue receipts |
| `MEETING_STARTED` | At the booking's scheduled start time | Start timers, post "meeting live" notices |
| `MEETING_ENDED` | At the booking's scheduled end time | Send follow-ups, surveys, invoices |
| `RECORDING_READY` | A Cal Video recording is available | Archive or transcribe recordings |
| `FORM_SUBMITTED` | A Routing Form is submitted | Push leads to a CRM |

Other triggers include `BOOKING_NO_SHOW_UPDATED`, `BOOKING_LOCATION_UPDATED`, `BOOKING_REASSIGNED`,
`BOOKING_SEAT_ACCEPTED`, `BOOKING_SEAT_REJECTED`, `INSTANT_MEETING`, `INSTANT_MEETING_ACCEPTED`,
`RECORDING_TRANSCRIPTION_GENERATED`, `OOO_CREATED`, `FORM_SUBMITTED_NO_EVENT`,
`AFTER_HOSTS_CAL_VIDEO_NO_SHOW`, `AFTER_GUESTS_CAL_VIDEO_NO_SHOW`, `WRONG_ASSIGNMENT_REPORT`, and the
organization-level `DELEGATION_CREDENTIAL_*` events.

## Event Payload Structure

Most events wrap their data:

```json
{
  "triggerEvent": "BOOKING_CREATED",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "payload": {
    "uid": "unique-booking-id",
    "bookingId": 100,
    "title": "Strategy Session between Organizer and Guest",
    "type": "standard-event-type",
    "startTime": "2024-01-01T10:00:00Z",
    "endTime": "2024-01-01T10:15:00Z",
    "organizer": { "name": "Organizer Name", "email": "organizer@example.com", "timeZone": "UTC" },
    "attendees": [{ "name": "Guest User", "email": "guest@example.com", "timeZone": "UTC" }],
    "responses": { "name": { "label": "your_name", "value": "Guest User" } },
    "status": "ACCEPTED"
  }
}
```

**Exception — `MEETING_STARTED` and `MEETING_ENDED`:** the booking fields are spread at the **top
level** next to `triggerEvent` (no `payload` wrapper), and custom templates are never applied to
them. A handler that works for every trigger reads `const data = event.payload ?? event`.

Other things to know:

- **Seated event types**: `attendees` contains only the attendee for the seat that triggered the
  webhook.
- **Versioning**: `2026-07-27` extends `2021-10-20`; booking payloads for `BOOKING_CREATED`,
  `BOOKING_RESCHEDULED`, `BOOKING_CANCELLED`, `BOOKING_PAID` (and a few others) additionally carry
  optional `attendeeIcsContent` / `organizerIcsContent` strings.
- **`FORM_SUBMITTED`**: answers are under `payload.responses` keyed by question label, and also
  duplicated at the root for backward compatibility.
- **Custom payload templates** replace the body entirely with your template (with `{{variable}}`
  substitutions). Your handler then receives whatever shape you defined.

## Full Event Reference

For the complete list of triggers and example payloads per version, see
[Cal.com's webhook documentation](https://cal.com/docs/developing/guides/automation/webhooks).
