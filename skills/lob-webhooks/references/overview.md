# Lob Webhooks Overview

## What Are Lob Webhooks?

Lob is a print-and-mail and address-verification API. When an event occurs in your Lob account
and a webhook is subscribed to that event type in that environment (Test or Live), Lob makes a
`POST` request to your URL with the **entire event object** as JSON. Webhooks cover postcards,
self mailers, letters, checks, addresses, and bank accounts, including USPS tracking events.

- Webhooks are created per environment. Test-environment webhooks fire for events from your Test API key, Live for your Live key.
- Tracking events (for example `postcard.in_transit`) only exist in the Live environment. To exercise them against your server, use the dashboard's webhook debugger.
- Events are sent as soon as they are available but **not in real time**; occasional delays happen. Use `tracking_events[].time` for the USPS timestamp.
- Subscribing to a later tracking event can deliver earlier ones too (for example `postcard.processed_for_delivery` arrives with the earlier `in_local_area`, `in_transit`, and `mailed` tracking events).

## Common Event Types

Dispatch on `event_type.id`. Lob documents 93 event types in all; see the
[full list](https://docs.lob.com/#all_event_types).

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `postcard.created` | A postcard is created | Audit logging |
| `postcard.processed_for_delivery` | The postcard is greenlit for delivery at the recipient's nearest postal facility | Notify the recipient mail is arriving |
| `postcard.in_local_area` | The postcard is in the destination area | Tracking dashboards |
| `postcard.in_transit` | The postcard is moving through the postal stream | Tracking dashboards |
| `postcard.mailed` | The postcard has been mailed | Confirm hand-off to USPS |
| `postcard.re-routed` | The postcard is re-routed (note the hyphen) | Address-change handling |
| `postcard.delivered` | The postcard is delivered | Trigger downstream "mail received" workflows |
| `letter.mailed` | A letter is mailed | Confirm hand-off to USPS |
| `letter.delivered` | A letter is delivered | Final receipt confirmation |
| `check.in_transit` | A check is in transit | Payment tracking |
| `self_mailer.rendered_thumbnails` | Thumbnails for a self mailer are rendered | Download previews automatically |

Letters with return envelope tracking (Enterprise) also send `letter.return_envelope.*` events.

## Event Payload Structure

```json
{
  "event_type": {
    "resource": "self mailers",
    "enabled_for_test": true,
    "id": "self_mailer.rendered_thumbnails",
    "object": "event_type"
  },
  "reference_id": "sfm_c29bbbca5f7bd489",
  "date_created": "2021-12-16T01:34:18.159Z",
  "id": "evt_d47ff1b815373f67",
  "body": {
    "id": "sfm_c29bbbca5f7bd489",
    "carrier": "USPS",
    "tracking_events": [],
    "thumbnails": [{ "small": "REDACTED", "medium": "REDACTED", "large": "REDACTED" }],
    "size": "6x18_bifold",
    "mail_type": "usps_first_class",
    "object": "self_mailer"
  },
  "object": "event"
}
```

- `event_type.id` is the event name to dispatch on.
- `id` is the event ID (use it for idempotency); `reference_id` and `body.id` are the resource ID.
- `body` is the resource (postcard, letter, check, ...). Lob redacts PII/PHI (addresses, metadata, description, merge variables, URLs; for checks also memo and bank account) by default; this is adjustable under Account > "Webhooks Payload" in the dashboard.
- Events follow the API version set on your Lob account at the time the event was created.

## Delivery and Retries

- Any `2xx` confirms delivery. Anything else (including TLS and DNS failures) is retried at increasing intervals: **8 attempts in all, over about 27.5 hours**.
- Return `2xx` quickly and do heavy work afterwards, to avoid retries caused by timeouts.
- If deliveries to a webhook fail for **5 consecutive days**, the webhook is disabled (you get an email); a single success resets the clock. Re-enable it by editing the webhook in the dashboard.
- Rate limits are configurable per webhook (per 5-second interval), and account admins can replay non-2xx events from a start date.

## Full Event Reference

For the complete list of events and payloads, see [Lob's webhook documentation](https://help.lob.com/print-and-mail/getting-data-and-results/using-webhooks) and [Lob's event types](https://docs.lob.com/#all_event_types).
