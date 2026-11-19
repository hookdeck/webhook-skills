# Samsara Webhooks Overview

## What Samsara Sends

Samsara is a connected-operations platform (vehicle telematics, ELD, equipment and site sensors). It sends webhooks in three ways, all to URLs you add under **Settings > Webhooks**:

| Source | `eventType` | When |
|---|---|---|
| Alerts | `Alert` | An alert whose action is "Send webhook" fires (for example `DeviceLocationInsideGeofence` or `DeviceSpeedAboveSpeedLimit` conditions) |
| Test button | `Ping` | You click **Test** on the webhook's configuration page |
| Event Subscriptions (Webhooks 2.0) | Event type name | A subscribed event occurs, such as `DvirSubmitted`, `SevereSpeedingStarted`, `AlertIncident`, or Beta events like `VehicleUpdated`, `GeofenceEntry` and `RouteStopArrival` |

See [Samsara's webhooks guide](https://developers.samsara.com/docs/webhooks) for the full, current list.

## Payloads

There are two shapes. Both carry `eventId` and `eventType`, so a handler can read either.

### Webhooks 1.0: alerts and Ping

The [webhooks guide](https://developers.samsara.com/docs/webhooks) describes these fields as on "all payloads"; in practice that's the 1.0 shape:

| Field | Meaning |
|---|---|
| `eventId` | The event's ID. Use it to skip duplicates |
| `eventMs` | Unix epoch time in milliseconds when the event was sent |
| `eventType` | `Alert` or `Ping` |
| `event` | The event that triggered the notification; its shape depends on the alert |

A Ping's `event` contains `"text": "Ping"`.

### Webhooks 2.0: Event Subscriptions

Each event type has its own page, such as [DvirSubmitted](https://developers.samsara.com/docs/dvirsubmitted):

| Field | Meaning |
|---|---|
| `eventId` | The event's ID. Use it to skip duplicates |
| `eventTime` | When the event happened, RFC 3339 (UTC) |
| `eventType` | The event type, such as `DvirSubmitted` |
| `orgId` | The Samsara organization ID |
| `webhookId` | The webhook that delivered it |
| `data` | The event's objects; for `DvirSubmitted`: `driver`, `dvir` and `vehicle` |

The examples take `eventTime` when present and otherwise convert `eventMs`, and read `data` or `event` for the details.

## Delivery

- **Method:** `POST`, JSON body.
- **Headers:** `X-Samsara-Timestamp` (Unix seconds) and `X-Samsara-Signature` (`v1=<hex>`). See [verification.md](verification.md).
- **Retries:** if your endpoint returns anything other than `2xx`, Samsara resends with exponential backoff, five attempts in total.
- **Redirects:** not followed (a `301` counts as a failure).
- **Timeout:** not documented. Samsara recommends returning `2xx` quickly and moving long work to a background job.
- **Timestamp window:** none documented. The timestamp is part of the signed content.

## Idempotency

Retries can deliver the same event more than once. Store `eventId` and ignore repeats.
