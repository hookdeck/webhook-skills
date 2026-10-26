# FourKites Webhooks Overview

## What Are FourKites Webhooks?

FourKites calls them callbacks (also "webhooks"). When you subscribe a URL, FourKites sends a
real-time JSON payload in an HTTP POST to your endpoint each time a subscribed event occurs.
FourKites' "Standard Webhooks" is a licensed product, not the standardwebhooks.com spec.

Callbacks are **not signed**. Authentication is one of Basic Auth, API Key / Auth Header, or
OAuth2 (client credentials), supplied to FourKites when you subscribe. This skill covers Basic.

## Common Event Types

The `MessageType` body field identifies the event.

| MessageType | Triggered When | Common Use Cases |
|-------------|----------------|------------------|
| `LOAD_CREATION` | FourKites creates a load | Store `FourKitesLoadId`, reconcile your TMS |
| `LOCATION_UPDATE` | A location update is recorded | Live map position |
| `TRACKING_UPDATE` | Key tracking updates on a load | Delay and status alerts |
| `STOP_ETA_UPDATED` | A stop's ETA changes | Re-plan dock appointments |
| `STOP_ARRIVAL` | Truck arrives at a stop | Start detention clock |
| `STOP_DEPARTURE` | Truck departs a stop | Mark pickup/delivery progress |
| `STOP_AUTO_COMPLETED` | A stop is completed automatically | Close out stops |
| `MANUALLY_DELIVERED` | Load manually marked delivered | Close the shipment |
| `MANUALLY_PICKED_UP` | Load manually marked picked up | Start in-transit tracking |
| `STOP_APPOINTMENT_RESCHEDULED` | A stop appointment changes | Sync appointments |
| `STOP_AMEND` | A stop is amended | Sync stop details |
| `LOAD_DELETED` | A load is deleted | Remove it downstream |

## Event Payload Structure

All callbacks follow a strict schema and every JSON key is present on every message. Common fields:

```json
{
  "MessageType": "STOP_ARRIVAL",
  "FourKitesLoadId": 1234,
  "LoadNumber": "BOL12345",
  "Scac": "CC79",
  "Shipper": "test-shipper",
  "StopName": "ABC Stop",
  "StopType": "pickup",
  "StopStatus": "at_facility",
  "Timestamp": "2015-10-01T16:00:00-05:00",
  "Timezone": "America/New_York"
}
```

## Retries

FourKites does not actively monitor your responses. On a `5XX` it retries with exponential
back-off: 1 minute, 15 minutes, 1 hour, 24 hours. A `4XX` (including `401`) is **not** retried, so
a wrong credential loses the message. Make handlers idempotent.

## Full Event Reference

See the [FourKites API reference](https://docs.fourkites.com/fourkites-api-reference/webhooks).
