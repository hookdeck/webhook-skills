# Dentally Webhooks Overview

## What Are Dentally Webhooks?

Dentally is dental practice management software. Webhooks notify your application when something changes in a Dentally account (for example, a new appointment). When an event occurs, Dentally sends a `POST` request to every enabled webhook endpoint subscribed to that event, containing the affected record plus the user who triggered it, if applicable. Larger practices can generate several thousand webhooks a day, so subscribe only to the events you need.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `appointment.created` | An appointment is booked | Sync diary, send confirmations |
| `appointment.updated` | An appointment changes (state, time, practitioner) | Reminders, rescheduling, attendance tracking |
| `appointment.deleted` | An appointment is deleted | Remove from external calendar |
| `patient.created` | A patient is registered | Create CRM contact |
| `patient.updated` | A patient record changes | Keep contact details in sync |
| `patient.deleted` | A patient record is deleted | Data retention / cleanup |
| `payment.created` | A payment is recorded | Reconcile accounts |
| `payment.updated` | A payment changes | Update ledger |
| `payment.deleted` | A payment is deleted | Reverse ledger entry |

## Event Payload Structure

```json
{
  "data": { "id": 2181, "patient_id": 1, "state": "Pending", "start_time": "2015-07-08 09:30:00 +0100", "reason": "Exam" },
  "event": "appointment.created",
  "object": "appointment",
  "user": { "id": 1, "first_name": "Gregory", "last_name": "Hays", "role": "Dentist" }
}
```

- `event` is the exact event string; `object` is `appointment`, `patient` or `payment`.
- `data` is the record; its shape depends on `object`.
- `user` is the user who triggered the event, when there is one.

Requests carry `User-Agent: Dentally-Webhook`, `Content-Type: application/json` and `X-Dentally-Signature`.

## Delivery Rules

- Webhooks may arrive out of order.
- Ignore unknown events and return `204 No Content`; new events can be added without it being a breaking change.
- Return any 2xx status. Otherwise Dentally retries up to 10 times at increasing intervals.
- More than 50 failed deliveries disables the webhook; re-enable it from Developer Settings.

## Full Event Reference

For the complete list of events and payloads, see [Dentally's webhook documentation](https://developer.dentally.co/#webhooks).
