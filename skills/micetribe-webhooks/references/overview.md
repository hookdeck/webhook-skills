# MICEtribe Webhooks Overview

## What Are MICEtribe Webhooks?

MICEtribe (micetribe.com) is an event registration, badge printing and check-in platform. Its webhooks send real-time HTTPS `POST` notifications with a JSON body when registration-related events happen on your event, so you can sync registrations with a CRM, analytics, access control or a custom backend. Webhooks are created through the Integrations management API (v1). A webhook only fires for the `event_id` it was created for, and only for the triggers enabled on it.

Delivery is asynchronous (queued after registration events), with a 10 second timeout per attempt.

## Common Event Types

The event is in the body's `meta.trigger` field (there is no event-type header).

| Event (`meta.trigger`) | Triggered When | Common Use Cases |
|------------------------|----------------|------------------|
| `registration.created` | A new registration is created | Add the attendee to a CRM, send a welcome message |
| `registration.updated` | An existing registration is updated | Sync status changes (e.g. `entry_status`), payment updates |
| `registration.deleted` | A registration is deleted | Remove access, clean up downstream records |
| `registration.attended` | Attendance is recorded | Track check-ins, open access control |
| `registration.printed` | A badge/registration is printed | Track badge print counts |

## Event Payload Structure

```json
{
  "registration_id": "6a08287fa219e11ac60d2a10",
  "data": {
    "registration_data": { "email": "attendee@example.com", "fullname": "Jane Doe", "first_name": "Jane", "last_name": "Doe" },
    "entry_status": "Approved",
    "persona": "attendee",
    "barcode": "ABC123XY",
    "print": { "print_count": 0, "last_printed_at": "", "last_printed_by": "" },
    "checkin": { "attended": false, "checkin_at": "" },
    "payment": { "total_payment": "10.00", "currency": "QAR", "method": "SkipCash" }
  },
  "meta": {
    "event_id": 7337,
    "event_name": "My Event",
    "webhook_name": "crm-sync",
    "occurred_at": "2026-06-01T12:29:11+00:00",
    "trigger": "registration.updated",
    "webhook_url": "https://your-server.com/webhooks/micetribe",
    "request_method": "post"
  }
}
```

(Abridged; the full sample also has `phone`, `source`, `mirror`, `event_slug`, `created_at` and `updated_at`.)

## Delivery Behavior

- `2xx` is success. `3xx` and above, network errors and timeouts (10 s) fail.
- Up to 5 retries, 15 min, 30 min, 3 h, 6 h and 12 h apart (a dispatcher runs every 15 minutes).
- Deliveries can repeat. Process idempotently on `registration_id` + `meta.trigger` + `X-Request-Id`.

## Full Event Reference

For the complete reference, see [MICEtribe's webhook documentation](https://developer.micetribe.com/webhooks-10150906f0).
