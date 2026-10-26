# parcelLab Webhooks Overview

## What Are parcelLab Webhooks?

parcelLab feeds every tracking event back into your shop systems by webhook. You give
parcelLab an HTTPS URL (plain HTTP is not supported) and credentials, and it POSTs one
request per event, per consignment. For split orders with several trackings, each tracking
gets its own `onDispatch`.

Requests come from three IP addresses you can allowlist: `35.156.240.70`, `35.157.215.87`
and `35.157.195.174`. Treat that as extra defence, not a replacement for the credential check.

Webhooks are **not signed**. Authentication is HTTP Basic, an access token header or OAuth 2.0
access token (this skill covers Basic).

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `onCreated` | A record is created through data transfer from the retailer | Sync the tracking record |
| `onUpdated` | A record is updated by the retailer (changed fields not included) | Re-sync the record |
| `onDispatch` | First carrier scan (network inbound), once only | Mark the order shipped |
| `onScheduled` | Carrier announces or changes the delivery day or window | Show the delivery date |
| `onOutForDelivery` | Consignment is out for delivery (a window may be given) | "Arriving today" notice |
| `onDelay` | Any delay or delivery issue; `data.exception_code` has the reason | Alert support |
| `onInternalDelay` | Consignment not shipped in time (breach of `send_date`) | Warehouse escalation |
| `onFailedAttempt` | Delivery attempted, recipient not met or location inaccessible; `data.next_action` is `NewAttemptToday`, `NewAttemptNextDay` or `PickupReady` | Customer outreach |
| `onPickupReady` | Ready for collection at an access point or locker; `data.pickup_location_address` | Pickup reminder |
| `onDelivered` | Final: delivered; `data.delivery_information` may hold details | Close the order |
| `onReturn` | Final: failed delivery, returning to sender; `data.return_reason` | Start refund or reship |

There is no deduplication: multiple `OutForDelivery` scans fire multiple `onOutForDelivery`
webhooks.

## Event Payload Structure

Each event is a POST with a JSON body (`Content-Type: application/json`):

```json
{
  "event": "onDelivered",
  "eventid": "abc123-def456",
  "timestamp": "2000-12-16T16:12:00.000Z",
  "references": {
    "courier": "dhl-germany",
    "tracking_number": "00340000000001",
    "orderNo": "ORD0012345",
    "client": "parcelFashion",
    "warehouse": "EU",
    "destination_country_iso3": "DEU",
    "language": "de"
  },
  "data": { "delivery_status": "Delivered", "delivery_location": "Doorstep" },
  "reporting": { "lead_time_door_to_door": 2, "lead_time_qualified_attempt": 2, "lead_time_end_to_end": 3 }
}
```

| Field | Description |
|-------|-------------|
| `event` | Event type, for example `onCreated` |
| `eventid` | Unique ID (a-f, 0-9 and dashes) for deduplication |
| `timestamp` | When the event happened, not when the webhook fired. ISO 8601 UTC |
| `references` | Consignment identifiers. Also optionally sent as URL query parameters (`courier`, `tracking_number`, `orderNo`, `client`, `warehouse`, `destination_country_iso3`, `language`) |
| `reporting` | Lead times; `-1` means the ending scan hasn't happened yet |
| `data` | Event data: `tracking_link`, `delivery_status`, localized status strings, `expected_delivery_date_raw` and more, plus event-specific keys |

## CloudEvents Format

parcelLab can send the CloudEvents format instead. The `data` key is dropped from the top
level and its contents are listed inside CloudEvents' own `data` key, with `references` and
`reporting` kept as sub-objects there. The event type is
`com.parcellab.tracking.event.<lowercased event>`. The examples read both shapes.

## Retries

If your endpoint returns an error, parcelLab retries **15 times at 30 minute intervals**, then
logs an error and deletes the event from the queue.

## Full Event Reference

For the complete schema and field list, see [parcelLab's webhook documentation](https://docs.parcellab.com/docs/developers/v2/data-elements/get-status-updates/webhooks).
