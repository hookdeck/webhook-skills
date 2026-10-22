# Foursquare Webhooks Overview

## What Are Foursquare Webhooks?

Foursquare's Movement SDK (formerly the Pilgrim SDK) normally notifies your
mobile app when a user arrives at a place, and your app then forwards the data
to your servers. Server webhooks skip that step: Foursquare calls your server
directly with an `application/json` `POST` for each arrival, departure, and
geofence event. They fire in addition to the SDK's regular callback and don't
change SDK behavior.

These webhooks are configured per project in the Developer Console. They are
not part of the Places API.

## Common Event Types

The payload's `eventType` field identifies the event.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `placeArrival` | User arrives at a place | Send a notification, log a visit |
| `placeDeparture` | User leaves a place | Close out a visit, measure dwell time |
| `placeHistorical` | A visit is reported after the fact | Backfill visit history |
| `geofenceEnter` | User enters a geofence | Trigger a location-based offer |
| `geofenceDwell` | User stays inside a geofence | Dwell-based engagement |
| `geofencePresence` | User is found inside a geofence | Presence checks |
| `geofenceExit` | User leaves a geofence | End a location-based session |
| `journeysInProgress` | Journey underway | Track a trip |
| `journeysApproaching` | User nearing the destination | Pre-arrival prompts |
| `journeysArrived` | User reached the destination | Confirm arrival |
| `journeysCompleted` | Journey finished | Close out a trip |
| `journeysCanceled` | Journey canceled | Clean up |

## Event Payload Structure

### Visit events (`placeArrival`, `placeDeparture`, `placeHistorical`)

| Field | Type | Description |
|-------|------|-------------|
| `pilgrimVisitId` | string | Unique ID of the visit |
| `eventType` | string | `placeArrival`, `placeDeparture`, or `placeHistorical` |
| `timestamp` | long | Event time, ms since epoch |
| `placeEvent` | object | `venues` (max 1 item), `arrivalTime`, optional `departureTime`, `confidence` (`none`/`low`/`med`/`high`), `locationType` (`venue`/`home`/`work`/`none`/`unknown`), optional `otherPossibleVenues` |
| `lat`, `lng` | double | User location |
| `user` | object | Developer-set user info, if configured in the SDK |
| `installId` | string | Pilgrim install ID |
| `sdkType`, `sdkBuild` | string | `iossdk` or `androidsdk`, and SDK version |
| `segments`, `userState` | object | Present if enabled |

### Geofence events

| Field | Type | Description |
|-------|------|-------------|
| `eventType` | string | `geofenceEnter`, `geofenceDwell`, `geofencePresence`, or `geofenceExit` |
| `timestamp` | long | Event time, ms since epoch |
| `geofenceEvent` | object | `eventType`, `eventLat`, `eventLng`, `radius`, `geofenceId`, `geofenceProperties`, `venueId`, `categoryIds`, `chainIds`, `partnerVenueId`, `venues` |
| `lat`, `lng`, `user`, `installId`, `sdkType`, `sdkBuild` | | Same as visit events |

### Journey events

Carry `journeyId`, `eventType`, `status`, `startTime`, `lastUpdated`, `eta`,
`path`, `confirmedArrival`, `venues`, `destination`, `categories`, `user`, and
`installId`.

### Request headers

| Header | Value |
|--------|-------|
| `Pilgrim-Secret` | Your project's secret, raw. Authenticates the request |
| `Content-Type` | `application/json` |
| `User-Agent` | `Foursquare-PilgrimSDK/<version>` |

## Full Event Reference

For payload fields and downloadable examples, see
[Foursquare's server webhook documentation](https://docs.foursquare.com/developer/docs/configure-server-webhooks).
