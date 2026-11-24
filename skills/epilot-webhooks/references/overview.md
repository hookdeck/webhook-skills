# epilot Webhooks Overview

## What Are epilot Webhooks?

[epilot](https://www.epilot.cloud) is a cloud CRM and commerce platform for energy utilities. The epilot Webhooks API lets you subscribe to events in your organization. When one occurs, epilot sends an HTTP request (the config's `httpMethod` is configurable; the API examples use POST) to your URL with a signed payload. Your server verifies the signature and answers `200`.

Each **webhook config subscribes to one event** (`eventName`). To receive several events, create several webhook configs, each with its own signing secret.

Payloads are sent with `Transfer-Encoding: chunked`. Most web servers handle that automatically. Microsoft Power Automate is a known incompatible service.

## Which epilot Webhook Events Are There?

`GET /v1/webhooks/events` returns the `eventName` values your organization can subscribe to. They include:

| Event | Triggered when | Common use cases |
|-------|----------------|------------------|
| Core Events (`event_<Name>`, e.g. `event_FileCreated`) | One of the 22 generally available [Core Events](https://docs.epilot.io/docs/integrations/core-events) happens, such as `FileCreated`, `MeterReadingAdded` or `CustomerRequestSubmitted`. Four Grid events are early access | Forward invoices, sync meter readings, open tickets |
| Custom Events (`event_<Name>`) | An event your organization defined on its own entity attributes | Organization-specific integrations |
| Automation Trigger Webhook | An automation action sends a webhook request (the most common trigger) | Push an entity to an ERP or billing system |
| Portal activities | A portal user accesses an entity (fires on every portal user login) | Audit logins, sync contacts |

The examples handle `FileCreated`, `CustomerRequestSubmitted` and the automation trigger, and acknowledge everything else with `200`.

## What Does an epilot Webhook Payload Look Like?

Default shape (no JSONata transformation):

```json
{
  "metadata": {
    "webhook_id": "wh_123",
    "organization_id": "org_1234567890",
    "event_type": "automation_trigger_webhook",
    "correlation_id": "c0ffee"
  },
  "entity": { "_id": "123456", "_schema": "opportunity", "name": "New Opportunity", "status": "open" },
  "relations": [],
  "activity": {},
  "changed_attributes": { "added": {}, "deleted": {}, "updated": {} }
}
```

| Field | Notes |
|-------|-------|
| `metadata.webhook_id` | ID of the webhook config. One config is one `eventName`, so this is the reliable join key |
| `metadata.organization_id`, `metadata.correlation_id` | Organization and tracking IDs |
| `metadata.automation_name`, `execution_id`, `action_id`, `user_id` | Optional. Present for automation-triggered or manually triggered events |
| `entity` | The main entity. For portal access it's the user's contact; for automations it's the entity the automation ran on |
| `relations`, `activity`, `changed_attributes` | Optional, depending on the webhook configuration |

Two caveats about the docs. The example block on epilot's Payload Structure page contains `//` comments, so it isn't valid JSON as shown, and it spells the schema field `_schema_` where epilot's other examples use `_schema`. Only that example shows `metadata.event_type`: the field table below it doesn't list the field, and neither the full JSONata example nor the portal example has it. Treat `event_type` as optional and key off `metadata.webhook_id`.

Core and Custom Events don't use that shape. They use the Event Catalog envelope (`_org_id`, `_event_time`, `_event_id`, `_event_name`, `_event_version`, `_event_source`) followed by the event's fields and hydrated entities, and the handlers read `_event_name` for them. File events add an `event_attachments` array.

A JSONata expression can reshape the JSON body, so a webhook with one configured may not match any of the above.

## How Are Files Delivered?

File events (for example `FileCreated`) support a `deliveryMode`:

- Default: JSON with `event_attachments` references only.
- `json_base64`: file bytes as Base64 in a `file_data` array. Signed over the full JSON body, so it verifies like any other delivery.
- `binary_multipart`: `multipart/form-data`. The signature covers a per-file string (`<sha256_hex>.<canonical_metadata_json>`), not the raw body. See [verification.md](verification.md).

Files over 100 MB are rejected with `413 FILE_TOO_LARGE` and aren't retried.

## How Do Retries Work?

`retryPolicy` is enabled by default on new webhooks with `maxAttempts` 3 (maximum 5). It retries 5xx, 429 and connection errors on the Standard Webhooks schedule: 5 s, 5 min, 30 min, 2 h, 5 h. Webhooks created before the feature have no retries. `webhook-id` is stable across retries, so dedupe on it. Events are logged for 4 weeks and can be replayed.

## Full Event Reference

See [epilot's webhook documentation](https://docs.epilot.io/docs/integrations/webhooks/overview) and its [security page](https://docs.epilot.io/docs/integrations/webhooks/security).
