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

```json
{
  "id": "evt_01GV12VR4DJP70GD1ZBK0SDWFH",
  "type": "sync.completed",
  "detail": {
    "connection": { "id": "cnn_...", "provider": { "code": "...", "name": "..." } },
    "sync": { "id": "...", "status": "completed" }
  }
}
```

- `id` is the event ID (`evt_...`); `type` is the event name; `detail` holds the related entities.
  Most events include the full related entities so you don't need a follow-up request.
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

The list is from Terminal's webhook events overview and may not be exhaustive: the OpenAPI spec also
describes `vehicle.location_updated` (`detail`: `connection`, `location`), which the overview doesn't
list. The examples acknowledge it with `200` and take no action.

## Delivery and Retries

Terminal treats any non-`2xx` response as a failed delivery and may retry it. It doesn't state a
retry schedule or timeout. Make your endpoint idempotent (deduplicate on `svix-id`) and respond
`2xx` quickly. Terminal's dashboard shows delivery status and errors and can replay messages.

## Full Event Reference

For the schema of every event, see Terminal's
[webhook events reference](https://docs.withterminal.com/api-reference/webhook-events/overview) and
the [webhooks guide](https://docs.withterminal.com/guides/webhooks).
