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

Procore's [How Webhooks Work](https://developers.procore.com/documentation/webhooks) page lists
the event fields. The payload format (`api_version`) is chosen when the hook is created and
cannot be changed afterwards. Procore's v2.0 (legacy) example:

```json
{
  "id": 123456789,
  "ulid": "0A1B2C3D4F5G6H7I8J9K0LMN",
  "timestamp": "2025-02-06T23:34:12.246562Z",
  "metadata": {
    "source_user_id": 987654321,
    "source_project_id": 2468013579,
    "source_operation_id": null,
    "source_company_id": 1357908642,
    "source_application_id": null
  },
  "user_id": 987654321,
  "company_id": 1357908642,
  "project_id": 2468013579,
  "api_version": "v2.0",
  "event_type": "update",
  "resource_name": "RFIs",
  "resource_id": 54321
}
```

v3.0 adds a `related_resources` array. v4.0, which Procore recommends for new integrations,
makes every ID a string, renames `event_type` to `reason` (which can include more than create,
update and delete) and `resource_name` to `resource_type`. Its example has no `ulid`, `metadata` or `api_version`
field.

Treat the payload as a notification and fetch the full record through the Procore REST API.
Deduplicate on `ulid` or the event `id`.

## Delivery

Procore expects a `2xx` (`200` or `204`) within 5 seconds of the connection being established.
Failed deliveries retry with exponential backoff, starting at 1 second and growing to 1 hour.
After 12 hours of continuous failure the queue is flushed and its events are marked discarded,
so pair webhooks with a periodic reconciliation sync.

The hook's Events view keeps event history for a rolling 28-day period. Event Status is one
of `Delivered`, `Discarded`, `Failed`, `Queued` or `Retrying`.

## Full Reference

- Procore support: https://v2.support.procore.com/product-manuals/admin-company/tutorials/configure-company-webhooks/
- Developer docs: https://developers.procore.com/documentation/webhooks
- Webhooks API: https://developers.procore.com/documentation/webhooks-api
