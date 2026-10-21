# Daytona Webhooks Overview

## What Are Daytona Webhooks?

Daytona sends HTTP callbacks to endpoints you register in the Daytona Dashboard when lifecycle events happen to your organization's sandboxes, snapshots and volumes. Use them for real-time notifications, triggering pipelines when a snapshot is built, usage monitoring, and audit logs.

Webhooks are available to all organization members. If **Webhooks** is missing from the Dashboard sidebar, contact support@daytona.io to have them enabled.

Deliveries are signed with the [Svix](https://docs.svix.com/receiving/verifying-payloads/how-manual) scheme (`svix-id`, `svix-timestamp`, `svix-signature`). Daytona's public webhook page does not document signing; this comes from Svix and from Daytona's source. See [verification.md](verification.md).

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `sandbox.created` | A new sandbox has been created | Track usage, start provisioning work |
| `sandbox.state.updated` | A sandbox's state has changed | React to start/stop, clean up, alert on failures |
| `snapshot.created` | A new snapshot has been created | Kick off deployment pipelines |
| `snapshot.state.updated` | A snapshot's state has changed | Wait for a build to become `active` |
| `snapshot.removed` | A snapshot has been removed | Audit, cache invalidation |
| `volume.created` | A new volume has been created | Inventory, audit |
| `volume.state.updated` | A volume's state has changed | Wait for a volume to become `ready` |

You can subscribe an endpoint to specific events or receive all of them and filter in your handler.

## Event Payload Structure

Every payload is a flat JSON object. Common fields:

| Field | Type | Description |
|-------|------|-------------|
| `event` | string | Event type, e.g. `sandbox.created` |
| `timestamp` | string | ISO 8601 time the event occurred |

Event-specific fields sit at the top level next to them:

```json
{
  "event": "sandbox.created",
  "timestamp": "2025-12-19T10:30:00.000Z",
  "id": "sandbox123",
  "organizationId": "org123",
  "state": "started",
  "sandboxClass": "container",
  "createdAt": "2025-12-19T10:30:00.000Z"
}
```

| Event | Fields besides `event` and `timestamp` |
|-------|-----------------------------------------|
| `sandbox.created` | `id`, `organizationId`, `state`, `sandboxClass`, `createdAt` |
| `sandbox.state.updated` | `id`, `organizationId`, `oldState`, `newState`, `updatedAt` |
| `snapshot.created` | `id`, `name`, `organizationId`, `state`, `createdAt` |
| `snapshot.state.updated` | `id`, `name`, `organizationId`, `oldState`, `newState`, `updatedAt` |
| `snapshot.removed` | `id`, `name`, `organizationId`, `removedAt` |
| `volume.created` | `id`, `name`, `organizationId`, `state`, `createdAt` |
| `volume.state.updated` | `id`, `name`, `organizationId`, `oldState`, `newState`, `updatedAt` |

The payload carries no event ID. Deduplicate on the `svix-id` header.

## Full Event Reference

See [Daytona's webhook documentation](https://www.daytona.io/docs/en/webhooks).
