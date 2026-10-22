# project44 Webhooks Overview

## What Are project44 Webhooks?

project44 pushes shipment updates to an endpoint you host instead of making you poll the GET
APIs. You register the endpoint with `PUT /api/v4/webhooks`, choose an HTTP method (`GET`, `POST`,
`PUT` or `PATCH`; default `POST`) and an authentication method. For `API_KEY`, project44 adds one
header per key (max 2) to every request. Requests are **not signed**: there is no HMAC and no
timestamp.

After creating the configuration, project44 asks you to contact your project44 representative to
complete the webhook setup.

## Common Event Types

Granular webhooks (the recommended option for shipments) send one message type per configuration,
named by `webhookConfiguration.webhookEventType`. The message carries the same value in `eventType`.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `shipments.v1.shipment.created` | A new shipment is created (once) | Register the shipment in your TMS |
| `shipments.v1.shipment.deleted` | A shipment is deleted | Stop tracking it |
| `shipments.v1.event.added` | An event is added to a shipment | Update milestones (e.g. gate out) |
| `shipments.v1.event.updated` | A shipment event is updated | Correct a milestone |
| `shipments.v1.event.removed` | A shipment event is removed | Remove a milestone |
| `shipments.v1.state.added` | A state is added to a shipment | Track lifecycle state |
| `shipments.v1.state.updated` | A state is updated | Track lifecycle state |
| `shipments.v1.state.removed` | A state is removed | Track lifecycle state |
| `shipments.v1.exception.addedOrUpdated` | An exception is added or updated | Alert on delays |

## Event Payload Structure

```json
{
  "eventId": "333d2a1b-d332-4775-8f8e-960e5f538431",
  "eventType": "shipments.v1.event.added",
  "createdDateTime": "2025-03-31T17:01:42.92601441Z",
  "dataType": "EventChange",
  "context": {
    "shipment": {
      "shipmentId": "ac694c91-e308-4329-9584-ee10acb937b3",
      "identifiers": [{ "type": "BILL_OF_LADING", "value": "BOL123" }],
      "attributes": [],
      "createdDateTime": "2025-03-31T17:01:42.92601441Z",
      "lastModifiedDateTime": "2025-03-31T17:01:42.92601441Z",
      "shipmentShareLink": "..."
    }
  },
  "data": {}
}
```

- `eventId` is unique per message: use it for idempotency (project44 can redeliver after a lost
  response).
- `context` holds the shipment by default; `includeContext` can add `ROUTE` and `RELATED_SHIPMENTS`.
- `data` is the event-specific change.
- Standard (non-granular) shipment webhooks use a different payload with no `eventType`.

## Delivery Behavior

- `2xx` = delivered. `408`, `429`, `502`, `503`, `504` and connection failures are retried for up
  to 48 hours, in order. Everything else (`3xx`, other `4xx` including `401`, `500`) is **not
  retried** and the message is dropped.
- Responses should return within a few seconds; the timeout is 20 seconds.
- project44 may send up to about 12 concurrent requests for unrelated messages.

## Full Event Reference

See the [project44 Webhook Guide](https://developers.project44.com/api-reference/webhook-guide) and
[Granular Webhook Configuration](https://developers.project44.com/api-reference/granular-webhook/granular-webhook-configuration).
