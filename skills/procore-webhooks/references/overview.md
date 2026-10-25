# Procore Webhooks Overview

## What Are Procore Webhooks?

The Procore Webhooks feature lets company and project administrators enable third-party
developers and integrators to subscribe to event notifications for one or more Procore API
resources when Create, Update or Delete actions occur. For example, a third-party RFI
integration can be notified whenever a new RFI is created. Procore sends an HTTP POST to the
hook's Endpoint URL.

Webhooks carry no signature. The only authentication is the optional Authorization Header
configured on the hook (see [verification.md](verification.md)). Because the credential is
static and there is no timestamp, a replayed request is indistinguishable from the original, so
make handlers idempotent.

## What Event Types Does Procore Send?

Each event is identified by a **resource name**, a **resource ID** and an **event type**:

| Event type | Triggered when | Common use cases |
|------------|----------------|------------------|
| `create` | A record of the subscribed resource is created | Sync a new RFI, submittal or daily log |
| `update` | A record is updated | Refresh a mirrored record |
| `delete` | A record is deleted | Remove or archive a mirrored record |

You choose the resources and the events to send when creating the hook.

## Event Payload Structure

Confirmed by the Procore support article: each event has a Resource Name, Resource ID, Event
Type, Event Status and a UTC timestamp. The payload format (REST API payload version) is chosen
when the hook is created and cannot be changed afterwards.

The v2 payload is described as carrying fields like the following. Only the resource name,
resource ID, event type and timestamp are confirmed by the support article; the rest could not
be checked against the developer docs, so this payload is **illustrative**:

```json
{
  "id": "evt_1",
  "ulid": "01H8XYZ0000000000000000000",
  "timestamp": "2026-10-25T12:00:00Z",
  "user_id": 42,
  "company_id": 1001,
  "project_id": 2002,
  "api_version": "v2",
  "event_type": "create",
  "resource_name": "RFIs",
  "resource_id": 3003
}
```

Treat the payload as a notification and fetch the full record through the Procore REST API.

## Delivery Status and History

The hook's Events view keeps event history for a rolling 28-day period. Event Status is one
of `Delivered`, `Discarded`, `Failed`, `Queued` or `Retrying`. The support article does not
describe the retry schedule.

## Full Reference

- Procore support: https://v2.support.procore.com/product-manuals/admin-company/tutorials/configure-company-webhooks/
- Developer docs: https://developers.procore.com/documentation/webhooks
