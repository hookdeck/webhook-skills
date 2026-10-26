# Texture Webhooks Overview

## What Are Texture Webhooks?

Texture is an energy-device data platform. A webhook **destination** belongs to one workspace
and receives that workspace's events (devices, commands, customers, enrollments, sites and
alerts) as an HTTP `POST` with a JSON body. At launch every event in the workspace is pushed
(a "Firehose"); delivery is real time. You can run several webhooks, for example one per
environment.

## Common Event Types

The body's `type` field is the dotted event name. Documented values:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `device.discovered` | A new device is discovered | Register the device in your system |
| `device.updated` | Device data is updated | Sync state, update dashboards |
| `device.disconnected` | A device goes offline | Alert operations, pause automation |
| `command.succeeded` | A device command succeeds | Mark a dispatch or schedule complete |
| `command.failed` | A device command fails | Retry or alert |
| `command.overridden` | A device command is overridden | Reconcile expected vs actual state |
| `customer.created` | A customer is created | Create the matching account |
| `enrollment.approved` | An enrollment is approved | Start program onboarding |
| `site.created` | A site is created | Link the site to your records |

Destinations *subscribe* with UPPER_SNAKE names (`DEVICE_UPDATED`, `COMMAND_SUCCEEDED`, ...).
That is a separate vocabulary: the wire `type` is the dotted form. Texture's webhooks page uses
`device.created` as an example `type`, but it is not in either documented list, so don't rely on
it. Handle the events you need and log the rest.

Texture's event naming is `noun.verb` for events and `noun:verb` for commands you send to a
device. If a `type` has a period it is an event.

## Event Payload Structure

Shared fields on every payload:

- `type` - the event name, e.g. `device.updated`
- `deviceId` - the device the event applies to
- `organizationId` - useful when several organizations post to one endpoint
- `workspaceId` - useful when several workspaces post to one endpoint

The rest varies by event and device type. Destinations with `redactCategories` set
(`LOCATION`, `CONTACT`) have those fields **omitted** from the body, so treat them as optional;
the signature is computed over the redacted body you receive.

## Delivery Behavior

- Respond with a 2xx status within 10 seconds, and do heavy work asynchronously.
- Failed deliveries are retried (the schedule is not documented), and persistent failures may
  lose events.
- Events may arrive out of order. Dedupe on the event `key`.
- Headers sent: `Texture-Signature` (the signature) and `Texture-Timestamp` (send time, **not**
  signed), plus any custom headers you configured on the destination.

## Full Event Reference

See [Texture's webhook documentation](https://docs.texturehq.com/platform-concepts/destinations/webhooks)
and the [destinations API](https://docs.texturehq.com/management-api/destinations).
