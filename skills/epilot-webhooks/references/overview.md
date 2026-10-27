# epilot Webhooks Overview

## What Are epilot Webhooks?

[epilot](https://www.epilot.cloud) is a cloud CRM and commerce platform for energy utilities. The epilot Webhooks API lets you subscribe to events in your organization. When one occurs, epilot sends an HTTP request (the config's `httpMethod` is configurable; the API examples use POST) to your URL with a signed payload. Your server verifies the signature and answers `200`.

Each **webhook config subscribes to one event** (`eventName`). To receive several events, create several webhook configs, each with its own signing secret.

Payloads are sent with `Transfer-Encoding: chunked`. Most web servers handle that automatically. Microsoft Power Automate is a known incompatible service.

## Which epilot Webhook Events Are There?

The vocabulary is per organization: `GET /v1/webhooks/events` returns the `eventName` values you can subscribe to. Triggers include:

| Event | Triggered when | Common use cases |
|-------|----------------|------------------|
| `automation_trigger_webhook` | An automation action sends a webhook request (the Automation Trigger Webhook, the most common trigger) | Push an entity to an ERP or billing system |
| `customer_request_created` | A customer request is created (an example name from an organization's event list) | Open a ticket, notify a team |
| `FileCreated` (listed as `event_FileCreated`) | A file is created. Event Catalog events use the `event_*` naming | Forward invoices and documents, optionally with the bytes |
| Portal activities | A portal user accesses an entity (fires on every portal user login) | Audit logins, sync contacts |

Other entity events and Event Catalog `event_*` events appear in your organization's list. The examples handle the three names above and acknowledge everything else with `200`.

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
  "entity": { "_id": "123456", "_schema_": "opportunity", "name": "New Opportunity", "status": "open" },
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

Two caveats about the docs. The example block on epilot's Payload Structure page contains `//` comments, so it isn't valid JSON as shown. And only that example shows `metadata.event_type`: the field table below it doesn't list the field, and the portal example's `metadata` has only `webhook_id` and `organization_id`. Treat `event_type` as optional and key off `metadata.webhook_id` when you need to be certain.

File events don't use that shape. They use the Event Catalog envelope (`_event_name`, `_event_id`, `_event_time`, `_org_id`, `operation`) plus an `event_attachments` array, and the handlers read `_event_name` for them.

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
