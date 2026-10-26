# Terminal49 Webhooks Overview

## What Are Terminal49 Webhooks?

Terminal49 tracks ocean containers and shipments. Instead of polling, you create a webhook and
Terminal49 POSTs a notification to your HTTPS endpoint when a tracking request resolves, a container
reaches a transport milestone, an ETA changes or a container record updates. Each notification is a
JSON:API document, signed with HMAC-SHA256 in the `X-T49-Webhook-Signature` header.

## Common Event Types

The event name is `data.attributes.event` (`data.type` is always `webhook_notification`).

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `tracking_request.succeeded` | A tracking request resolved to a shipment and containers | Store the shipment/container IDs |
| `tracking_request.failed` | A tracking request could not be resolved | Surface the failure to the user |
| `tracking_request.awaiting_manifest` | Terminal49 is waiting for the carrier manifest | Show a pending state |
| `tracking_request.tracking_stopped` | Tracking of the request stopped | Stop expecting updates |
| `container.transport.vessel_loaded` | A container was loaded on a vessel | Milestone timeline |
| `container.transport.vessel_departed` | A vessel departed with the container | Departure alerts |
| `container.transport.vessel_arrived` | A vessel arrived at port | Arrival alerts |
| `container.transport.vessel_discharged` | A container was discharged from a vessel | Terminal pickup planning |
| `container.transport.available` | A container is available for pickup | Dispatch drayage |
| `container.transport.empty_out` / `full_in` | Empty released / full container gated in | Origin-side milestones |
| `container.transport.transshipment_arrived` / `_discharged` / `_loaded` / `_departed` | Transshipment steps | Route tracking |
| `container.transport.feeder_arrived` / `_discharged` / `_loaded` / `_departed` | Feeder vessel steps | Route tracking |
| `container.transport.rail_loaded` / `_departed` / `_arrived` / `_unloaded` | Rail legs | Inland tracking |
| `container.transport.delivered`, `empty_in`, `full_out`, `not_available` | Delivery-side milestones | Completion, returns |
| `container.transport.estimated.vessel_arrived` / `vessel_departed` / `arrived_at_inland_destination` | Estimated milestone changed | ETA updates |
| `container.created`, `container.updated` | A container record was created or changed | Re-fetch container state |
| `container.pickup_lfd.changed` (and `_line`, `_rail`, `_terminal` variants), `container.pickup_appointment.changed`, `container.delivery_appointment.changed`, `container.detention_lfd_line.changed`, `container.holds_at_pod_terminal.changed`, `container.pod_terminal_changed` | Last free day, appointment, hold or terminal changes | Demurrage and pickup planning |
| `shipment.estimated.arrival` | A shipment's estimated arrival changed | ETA updates |
| `shipment.routing.filled` | Routing data was filled in | Show the route |

The handlers in `examples/` act on `tracking_request.succeeded`, `tracking_request.failed`,
`container.transport.vessel_arrived`, `container.transport.vessel_departed`,
`container.transport.available`, `container.updated` and `shipment.estimated.arrival`, and log
the rest. Terminal49 also sends document-processing events; check the live catalog.

## Event Payload Structure

```json
{
  "data": {
    "id": "a3baf7bb-3ffe-485e-bf9d-7b7dd17a08a8",
    "type": "webhook_notification",
    "attributes": {
      "id": "a3baf7bb-3ffe-485e-bf9d-7b7dd17a08a8",
      "event": "container.transport.vessel_loaded",
      "delivery_status": "succeeded",
      "created_at": "2022-10-21T20:16:47Z"
    },
    "relationships": {
      "reference_object": { "data": { "id": "58114b8d-...", "type": "transport_event" } },
      "webhook": { "data": { "id": "7c353e67-...", "type": "webhook" } },
      "webhook_notification_logs": { "data": [] }
    }
  },
  "included": [ { "type": "shipment", "id": "...", "attributes": { } },
                { "type": "container", "id": "...", "attributes": { } } ]
}
```

- `data.id` is unique per notification: use it as the idempotency key.
- `reference_object.data.type` names the object that caused the event (`tracking_request`,
  `transport_event`, `container_updated_event`, ...).
- `included` carries the related shipment, container and transport event records.

## Delivery

- Accept with `200`, `201`, `202` or `204`. Any other response or a timeout is retried up to 12
  times, then the notification is marked `failed`.
- Missed notifications cannot be replayed. Review them with `GET /v2/webhook_notifications`
  (`delivery_status: failed`) and re-fetch state from the REST API.

## Full Event Reference

For the complete list of events and payloads, see Terminal49's
[webhook guide](https://terminal49.com/docs/api-docs/in-depth-guides/webhooks) and
[event catalog](https://terminal49.com/docs/api-docs/webhooks/event-catalog).
