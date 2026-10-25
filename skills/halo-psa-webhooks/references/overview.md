# HaloPSA Webhooks Overview

## What Are HaloPSA Webhooks?

Halo (HaloPSA, HaloITSM and HaloCRM share the same webhook feature) can send an HTTP request to
an external URL when a notification event occurs. Webhooks are configured under
**Configuration > Integrations > Webhooks**. All payloads are JSON, and the receiving service
must accept a JSON payload.

Webhooks are **not signed**. The only authentication choices are *No Authentication* and
*Basic Authentication*, so use Basic Authentication.

## Common Event Types

The events are the same as Halo notification profiles. You need at least one event per webhook,
and can add conditions to each.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `New Ticket Logged` | A ticket is created | Create a matching record elsewhere, alert a channel |
| `Ticket Reassigned` | A ticket is reassigned | Notify the new assignee |
| `Document deleted on a Ticket` | An attachment is deleted (v2.242+) | Keep attachments in sync |
| `Document edited on a Ticket` | An attachment is edited (v2.242+) | Keep attachments in sync |

These are the only event names Halo's webhook guide gives (it says "etc."); the full list is the
notification events offered in the webhook's **Events** list in your Halo instance.

## Event Payload Structure

The **Payload** setting chooses the shape:

- **Small object with key fields only**: the basic properties of the entity
- **Full object with linked objects**: everything relevant
- **Event information only**: the object ID and event name
- **Use a custom payload**

Each type contains an ID, notification ID, escmsg ID, event name, webhook ID, object ID and
timestamp. The documentation doesn't name those JSON properties in text, so any payload shown in
this skill is **illustrative**:

```json
{
  "id": 1,
  "event": "New Ticket Logged",
  "object_id": 4021,
  "timestamp": "2026-10-25T10:00:00Z"
}
```

Check a real delivery on the webhook's **Deliveries** tab (or in Hookdeck) for the actual names.

## Batching

The **Batching** setting is only available when the payload is not *Full object with linked
objects*, the type is *Standard webhook* and the method is POST. The options are one delivery
per occurrence (default), or grouping by event, by event type, or all events in one delivery.
With batching on, the body is a **JSON array of objects** rather than a single object, so your
handler must accept both.

## Method

The **Method** setting offers POST (send data from Halo) and GET (retrieve data). Notifications
are POSTs, and Hookdeck's HaloPSA source accepts POST only.

## Full Event Reference

See Halo's [Webhook Integration guide](https://www.usehalo.com/guides/838).
