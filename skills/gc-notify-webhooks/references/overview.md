# GC Notify Webhooks Overview

## What Are GC Notify Callbacks?

GC Notify is the Government of Canada's notification service (a fork of GOV.UK Notify, not GOV.UK
Notify itself). A callback is a POST request GC Notify sends to a URL you choose when an email or
text message you sent is delivered or fails. Callbacks can automate delivery receipts or persist
notification status to your database. Requests are not signed; each one carries your bearer token
in the `Authorization` header.

## Delivery Receipt Statuses

There is no `event` field. Dispatch on `status`, not `status_description`: the docs list 10
statuses but only 9 descriptions, so they don't pair one-to-one.

| `status` | `status_description` | Common Use Cases |
|----------|----------------------|------------------|
| `created`, `sending`, `pending` | In transit | Track progress |
| `sent` | Not paired in the docs; notification-api labels it `Delivered` for email, `Sent` for SMS | Track progress |
| `delivered` | Delivered | Mark the message delivered |
| `permanent-failure` | Blocked, No such number, No such address | Stop sending to the recipient |
| `temporary-failure` | Content or inbox issue, Carrier issue | Record; a later callback may update it |
| `technical-failure` | Tech issue | Alert, consider resending |
| `pending-virus-check` | In transit | Track progress |
| `virus-scan-failed` | Attachment has virus | Tell the sender the attachment was rejected |

Statuses and descriptions are only in English.

## Payload Structure

A JSON object where every value is a string (or `null`/nil):

| Key | Description | Format |
|-----|-------------|--------|
| `id` | GC Notify's id for the status receipt | UUID |
| `reference` | The reference your service sent | `12345678` |
| `to` | Recipient email address or phone number | `hello@canada.ca` or `01234567890` |
| `status` | Notification status (table above) | string |
| `status_description` | Label for the delivery status | string |
| `provider_response` | Detailed provider response; only set on a technical failure | string or nil |
| `created_at` | When the service sent the request | `2017-05-14T12:15:30.000000Z` |
| `completed_at` | Last time the status was updated | timestamp or nil |
| `sent_at` | When the notification was sent | timestamp or nil |
| `notification_type` | Notification type | `email` or `sms` |

Example built from the documented field table (not a captured delivery):

```json
{
  "id": "3b0f9c1e-6d6b-4a6c-9f1e-0a4d3d3f9e11",
  "reference": "12345678",
  "to": "hello@canada.ca",
  "status": "delivered",
  "status_description": "Delivered",
  "provider_response": null,
  "created_at": "2017-05-14T12:15:30.000000Z",
  "completed_at": "2017-05-14T12:15:30.000000Z",
  "sent_at": "2017-05-14T12:15:30.000000Z",
  "notification_type": "email"
}
```

## Multiple Callbacks and Health Checks

- A notification can produce more than one callback (for example `delivered`, then a bounce).
  Callbacks are sent in the order received.
- GC Notify sends `{"health_check": "true"}` when you set up or update callbacks, or test response
  time from the callbacks page.
- Callbacks work with test API keys but not with smoke-testing email addresses or phone numbers.

## Delivery and Retries

Your endpoint should respond within 1 second. GC Notify retries a failed callback 6 times over 25
minutes, then emails you. With repeated errors it suspends callbacks for your service until you
contact them.

## Full Reference

See [GC Notify's callbacks documentation](https://documentation.notification.canada.ca/en/callbacks.html).
