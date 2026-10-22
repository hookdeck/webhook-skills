# Acuity Scheduling Webhooks Overview

## What Are Acuity Scheduling Webhooks?

Acuity Scheduling (a Squarespace product) notifies a URL when an appointment is scheduled,
rescheduled or canceled, and when a package, gift certificate or subscription order is completed.
You can create **static** webhooks in your account's Integrations settings, or **dynamic** webhooks
through the Webhooks API (`POST /api/v1/webhooks`, up to 25 per account).

Requests are `application/x-www-form-urlencoded` POSTs. The notification only carries IDs; call the
Acuity API (get appointment by ID, or get orders) for the details.

## Common Event Types

The event type is the `action` form field.

| Action | Triggered When | Common Use Cases |
|--------|----------------|------------------|
| `scheduled` | An appointment is initially booked (once) | Create CRM record, send confirmation |
| `rescheduled` | An appointment is moved to a new time | Update calendar, notify staff |
| `canceled` | An appointment is canceled | Free capacity, trigger follow-up |
| `changed` | Catch-all: any change to the appointment, including initial booking, reschedule, cancel, and detail or intake form edits | Keep an external copy in sync |
| `order.completed` | A package, gift certificate or subscription order is completed | Provision credit, fulfil order |

Using `changed` together with `scheduled`, `rescheduled` or `canceled` may lead to duplicate requests.

Dynamic webhooks subscribe with event names prefixed `appointment.` (`appointment.scheduled`,
`appointment.rescheduled`, `appointment.canceled`, `appointment.changed`) plus `order.completed`.

## Payload Structure

| Field | Description |
|-------|-------------|
| `action` | One of the actions above |
| `id` | Appointment ID, or order ID for `order.completed` |
| `calendarID` | Calendar of the appointment (appointments only) |
| `appointmentTypeID` | Appointment type (appointments only) |

Example body: `action=changed&id=13&calendarID=1&appointmentTypeID=13`

## Headers

| Header | Description |
|--------|-------------|
| `X-Acuity-Signature` | Base64 HMAC-SHA256 of the raw body, keyed with the account API key |

## Retries

Acuity retries only on HTTP 500 or network errors, with exponential backoff over 24 hours (2s, 30s,
1m, 5m, 10m, 15m, 30m, 1h, 12h). A webhook failing for 5 days is disabled and must be re-enabled
manually. Other statuses, including 400, are not retried.

## Full Event Reference

See [Acuity's webhook documentation](https://developers.acuityscheduling.com/docs/webhooks).
