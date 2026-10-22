# OnceHub Webhooks Overview

## What Are OnceHub Webhooks?

OnceHub (scheduling) sends an HTTPS POST with a JSON body to the URL of each webhook subscription
whenever a subscribed booking or conversation lifecycle event happens. Subscriptions are created in
the OnceHub app (Account Integrations > APIs & Webhooks) or with the `/webhooks` API. A webhook URL
must start with `https://`.

If your endpoint doesn't return `2xx`, OnceHub retries with exponential backoff for about 3 days,
then automatically disables the webhook
([Webhook Delivery Retries](https://help.oncehub.com/developers/webhooks/using-webhooks/#webhook-delivery-retries)).

**Only v2 webhooks are signed.** If the webhook has no **View secret** option in the dashboard, it
is a v1 webhook: it carries no `Oncehub-Signature` header and can't be verified. New webhooks are
created as v2, so create a new one to get signing.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `booking.scheduled` | A booking is made | CRM record, confirmation flow |
| `booking.rescheduled` | A booking is rescheduled | Update calendar/CRM time |
| `booking.reassigned` | A booking is reassigned to another owner | Update owner |
| `booking.canceled_then_rescheduled` | A booking is canceled and then rescheduled | Link old and new booking |
| `booking.canceled_reschedule_requested` | A booking is canceled and a reschedule is requested | Follow-up outreach |
| `booking.canceled` | A booking is canceled | Release resources, notify team |
| `booking.completed` | A booking is completed | Follow-up emails, billing |
| `booking.no_show` | A booking is marked no-show | No-show workflow |
| `conversation.started` | A conversation starts | Lead routing |
| `conversation.closed` | A conversation is closed | Close CRM task |
| `conversation.abandoned` | A conversation is abandoned | Re-engagement |

## Event Payload Structure

One event per request (not an array):

```json
{
  "id": "EVNT-2AB8RJY3LF",
  "object": "event",
  "creation_time": "2021-01-20T12:10:03.140Z",
  "type": "booking.scheduled",
  "api_version": "v2",
  "data": {
    "object": "booking",
    "id": "BKNG-YNMGHKQ24XV5",
    "subject": "15-minute meeting",
    "status": "scheduled",
    "starting_time": "2021-01-20T16:45:00.000Z",
    "duration_minutes": 15,
    "owner": { "id": "USR-YX0J4ANZTV", "object": "user", "email": "michael@example.com" },
    "rescheduled_booking_id": "",
    "cancel_reschedule_information": { "reason": "", "actioned_by": "", "user_id": "" },
    "form_submission": { "name": "Carrie", "email": "carrie@customer.com" },
    "booking_calendar": { "id": "BKC-LDJ878496X", "object": "booking_calendar" }
  }
}
```

`id` (`EVNT-...`) is unique per event and is a good idempotency key. Booking events carry a
`booking` in `data`; conversation events carry a `conversation`.

## Full Event Reference

See [OnceHub's webhook documentation](https://help.oncehub.com/developers/webhooks/introduction-to-webhooks/)
and the [webhook event payloads](https://help.oncehub.com/developers/api/#tag/webhook-events).
