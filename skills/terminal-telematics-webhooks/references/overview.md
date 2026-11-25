# Terminal Webhooks Overview

## What Are Terminal Webhooks?

[Terminal](https://withterminal.com) is a unified API for telematics and ELD data: connections to
fleet providers, syncs, vehicles, drivers, trailers, and safety events. Terminal sends an HTTP `POST`
with a JSON payload to an endpoint you register in its dashboard whenever something happens, such
as a connection being created or a sync finishing. Webhooks are the supported way to forward Terminal
events to tools like Slack or Microsoft Teams (through your own middleware); Terminal has no
first-party destinations for them.

Terminal delivers through [Svix](https://www.svix.com/), so every request carries `svix-id`,
`svix-timestamp` and `svix-signature` headers (Standard Webhooks-compatible; the `webhook-*` names
carry the same values). See [verification.md](verification.md).

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `connection.created` | A connection is created with a provider account | Store the connection ID |
| `connection.completed` | A user successfully completes authentication | Finish your onboarding flow |
| `connection.disconnected` | Credentials are invalid and the user must re-authenticate | Prompt the user to reconnect |
| `connection.reconnected` | A disconnected connection is re-authenticated | Resume normal syncing |
| `sync.completed` | A connection sync completes successfully | Fetch new data from Terminal |
| `sync.failed` | A connection sync fails | Alert, inspect `sync.failureReason` |
| `connection.first_sync_completed` | A connection's first successful sync completes | Mark the connection as ready |
| `delivery.completed` | A data delivery (for example to S3) finishes | Start ingesting delivered files |
| `issue.reported` | An issue with a connection is reported | Surface it to the customer |
| `vehicle.added` | A vehicle appears on a connection | Update your fleet records |
| `driver.modified` | A driver changes | Update your driver records |
| `safety_event.added` | A safety event is recorded | Notify safety teams |

For S3 or other data delivery destinations, `sync.completed` does not mean files have arrived;
use `delivery.completed` for that.

## Event Payload Structure

Terminal's webhooks guide shows this shape, with the entities elided:

```json
{
  "id": "evt_01GV12VR4DJP70GD1ZBK0SDWFH",
  "type": "sync.completed",
  "detail": {
    "connection": {
      // connection details
    },
    "sync": {
      // sync details
    }
  }
}
```

- `id` is the event ID (`evt_...`); `type` is the event name; `detail` holds the related entities.
  Most events include the full related entities so you don't need a follow-up request.
- Every event schema in the OpenAPI spec also requires a top-level `timestamp` (ISO 8601), which the
  guide's example leaves out.
- Terminal's guide shows `connection` and `sync`. Its OpenAPI spec (`terminal.openapi.json`) gives the
  `detail` keys for the rest, listed below. Check the API reference for the full schemas.

| Events | `detail` keys |
|--------|---------------|
| `connection.*` (created, disconnected, reconnected, updated, pending_deletion, deleted) | `connection` |
| `connection.completed` | `connection`, `metadata` |
| `sync.*`, `connection.first_sync_completed` | `connection`, `sync` |
| `delivery.*` | `destination`, `delivery` |
| `issue.reported`, `issue.resolved` | `connection`, `issue` |
| `provider.availability_updated` | `provider`, `availability`, `update` |
| `unsupported_provider.requested` | `provider`, `contactEmail` (also `dotNumber`, `externalId`, `tags`) |
| `vehicle.*`, `driver.*`, `trailer.*` | `connection`, `vehicle` / `driver` / `trailer` |
| `safety_event.*` | `connection`, `safetyEvent` |
| `link.analytics_event_emitted` | varies by Link action |

`provider.availability_updated` is not tied to a connection: every application subscribed to it
receives it for every provider.

## Full Event List (32 documented)

- **Connection:** `connection.created`, `connection.disconnected`, `connection.reconnected`,
  `connection.completed`, `connection.updated`, `connection.pending_deletion`, `connection.deleted`,
  `connection.first_sync_completed`
- **Sync:** `sync.requested`, `sync.started`, `sync.completed`, `sync.failed`
- **Delivery:** `delivery.requested`, `delivery.started`, `delivery.failed`, `delivery.completed`
- **Issue:** `issue.reported`, `issue.resolved`
- **Provider and Link:** `provider.availability_updated`, `unsupported_provider.requested`,
  `link.analytics_event_emitted`
- **Fleet data:** `vehicle.added`, `vehicle.modified`, `vehicle.removed`, `driver.added`,
  `driver.modified`, `driver.removed`, `trailer.added`, `trailer.modified`, `trailer.removed`,
  `safety_event.added`, `safety_event.modified`

The list is from Terminal's webhook events overview. The OpenAPI spec also has a
`vehicle.location_updated` schema (`detail`: `connection`, `location`), marked hidden behind a feature
flag, which the overview doesn't list. The examples acknowledge any unlisted type with `200` and take
no action.

## Delivery and Retries

A delivery succeeds only on a `2xx` within 30 seconds. Any other status (`3xx` included), a
connection error or a timeout is a failure, retried on Svix's schedule: immediately, then 5 seconds,
5 minutes, 30 minutes, 2 hours, 5 hours, 10 hours and 10 hours after each failure. After the eighth
attempt the message is marked failed; open it in the dashboard to replay it or recover failed
messages from a given time. If every attempt to an endpoint fails for 5 days, Svix disables it.

Delivery is at-least-once: retries carry the same payload `id`, so deduplicate on it. A later event
can succeed while an earlier one is still retrying, so events can arrive out of order; compare
`timestamp` before overwriting newer state.

## Full Event Reference

For the schema of every event, see Terminal's
[webhook events reference](https://docs.withterminal.com/api-reference/webhook-events/overview) and
the [webhooks guide](https://docs.withterminal.com/guides/webhooks).
