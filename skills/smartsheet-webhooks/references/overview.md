# Smartsheet Webhooks Overview

## What Are Smartsheet Webhooks?

A Smartsheet webhook subscribes your HTTPS endpoint (`callbackUrl`) to events on a sheet (scope `sheet`) or, for seat-type changes, a plan (scope `plan`). Webhooks are created with `POST /webhooks`, are disabled until your endpoint passes a verification challenge, and then Smartsheet sends callbacks as events occur.

There are two kinds of callback:

- **Event callback**: lists the events that happened (the common case).
- **Status change callback**: sent when a webhook is automatically disabled or re-enabled because its owner lost or regained access to the scope object. It carries `newWebhookStatus`.

Callbacks are "skinny": they identify changed objects and the event type but carry no object data. Use the IDs to call the Smartsheet API. For Smartsheet Commercial, a one-minute debounce groups rapid changes.

## Common Event Types

Each entry in a callback's `events` array has an `objectType` and an `eventType`. Webhooks filter with `objectType.eventType` patterns.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `row.created` | A row is added | Request approval, assign a related task |
| `row.updated` | A row is updated | Sync data to another system |
| `row.deleted` | A row is deleted | Remove the matching record elsewhere |
| `cell.updated` | A cell value changes | Trigger automation on a status column |
| `sheet.updated` | The sheet is updated | Refresh a cached copy |

Sheet `objectType` values: `attachment`, `cell`, `column`, `comment`, `discussion`, `row`, `sheet`. Plan webhooks use `user.seatType.updated`.

Filter patterns: `*.*` (all, the default), `row.*`, `cell.*`, `column.*`, `sheet.*`, `attachment.*`, `discussion.*`, `comment.*`, or exact names such as `row.created`.

## Event Payload Structure

```json
{
  "nonce": "f1f8a8e6-5d2b-4a6c-9d0a-7f0f3a1b2c3d",
  "timestamp": "2026-10-22T10:00:00.000+00:00",
  "webhookId": 8444254503626628,
  "scope": "sheet",
  "scopeObjectId": 3285357287499652,
  "events": [
    { "objectType": "row", "eventType": "created", "id": 1, "userId": 2 },
    { "objectType": "cell", "eventType": "updated", "rowId": 1, "columnId": 2 }
  ]
}
```

Fields shown beyond `scopeObjectId`, `events`, `objectType`, `eventType` and `newWebhookStatus` follow the Callback schema in the Smartsheet API reference; check it for the full list per object type.

## Delivery and Retries

Respond with `200` to acknowledge. For sheet webhooks, Smartsheet retries up to 14 times on 4xx (except 410), 5xx and timeouts: the first seven with exponential backoff, then every three hours. Other statuses (2xx other than 200, 3xx, 410) are not retried. When retries run out or retrying is disqualified, the webhook is disabled with status `DISABLED_CALLBACK_FAILED`. A webhook waits for the current callback to finish before sending the next. Smartsheet de-duplicates identical webhooks (same object, owner, `callbackUrl`, `subscope`).

Callbacks and challenges come from the `webhooks.smartsheet.com` domain. The `callbackUrl` must be HTTPS with a CA-signed certificate, not a private IP, on port 443, 8000, 8008, 8080 or 8443.

## Full Event Reference

For the complete list, see [Webhook event types](https://developers.smartsheet.com/api/smartsheet/webhook-event-types) and [Webhook callbacks](https://developers.smartsheet.com/api/smartsheet/guides/webhooks/webhook-callbacks).
