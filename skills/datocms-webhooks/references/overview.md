# DatoCMS Webhooks Overview

## What Are DatoCMS Webhooks?

DatoCMS sends an HTTP POST to a URL you configure when something changes in a project: a record
is saved or published, a media asset is uploaded, a build deploys. They are useful for syncing
content to search indexes or commerce systems, triggering site deploys, and sending notifications.

Webhooks are **not signed** and have no timestamp. You can set HTTP Basic credentials
(`http_basic_user` / `http_basic_password`) and custom headers on each webhook. Your endpoint
authenticates requests with those credentials. See [verification.md](verification.md) for what
that does and does not protect against.

DatoCMS needs a `2xx` reply to mark a delivery successful. Anything else, or a timeout, marks it
`Failed` (or `Rescheduled` when Automatic Retries is on). Timeouts: 2 seconds to connect, 8
seconds total, so acknowledge quickly and process in the background.

## Event Types

A webhook has triggers; each is an `entity_type` plus one or more `event_type` values.

| `entity_type` | `event_type` | Triggered When | Common Use Cases |
|---------------|--------------|----------------|------------------|
| `item` | `create` | A record is saved for the first time | Index new content |
| `item` | `update` | A record is modified and saved | Re-sync; diff with `previous_entity` |
| `item` | `delete` | A record is deleted | Remove from external systems |
| `item` | `publish` | A record is published | Trigger a site rebuild |
| `item` | `unpublish` | A record is unpublished | Remove from public search |
| `item_type` | `create`, `update`, `delete` | A model changes, including its fields | Schema sync |
| `upload` | `create`, `update`, `delete` | A media asset changes | Sync to a CDN |
| `build_trigger` | `deploy_started`, `deploy_succeeded`, `deploy_failed` | A build trigger deploys | Deploy notifications |
| `environment` | `deploy_started`, `deploy_succeeded`, `deploy_failed` | An environment deploys | Environment monitoring |
| `maintenance_mode` | `change` | An admin activates or deactivates maintenance mode | Pause integrations |
| `sso_user` | `create` | An SSO user is added as a collaborator | Audit access |
| `cda_cache_tags` | `invalidate` | CDA cache tags need invalidating | Purge a cache |

In the DatoCMS dashboard, `item_type` is called "Model" and `item` is called "Record".

## Record Lifecycle Sequences

With the draft/publish system enabled:

| When a record is... | Events sent | `entity.meta.status` |
|---------------------|-------------|----------------------|
| Saved for the first time | `create` | `draft` |
| Modified and saved without publishing | `update` | `draft` |
| Published | `publish` | `published` |
| Modified and saved after publishing | `update` | `updated` |
| Unpublished | `unpublish` | `draft` |
| Deleted from draft | `delete` | `draft` |
| Deleted from published | `unpublish`, `delete` | `published` |

With draft/publish **disabled** on a model, `publish` and `unpublish` are implicit, so one user
action sends several events: create sends `create` then `publish`; update sends `update` then
`publish`; delete sends `unpublish` then `delete`.

## Default Payload

```json
{
  "site_id": "example-site-id",
  "webhook_id": "123",
  "environment": "main",
  "is_environment_primary": true,
  "webhook_call_id": "456",
  "event_triggered_at": "2024-08-26T14:30:00Z",
  "attempted_auto_retries_count": 0,
  "entity_type": "item",
  "event_type": "update",
  "entity": {
    "id": "39830648",
    "type": "item",
    "attributes": { "name": "Mark Smith" },
    "relationships": { "item_type": { "data": { "id": "810928", "type": "item_type" } } },
    "meta": { "status": "published", "current_version": "117626080" }
  },
  "previous_entity": { "id": "39830648", "type": "item", "attributes": { "name": "John Smith" } },
  "related_entities": [{ "id": "810928", "type": "item_type", "attributes": { "api_key": "author" } }]
}
```

- `previous_entity` is only present for record `update` events.
- `webhook_call_id` identifies the delivery; use it for idempotency since retries and manual
  resends repeat the call.
- `entity` follows the Content Management API schema (`payload_api_version` selects the version).

## Custom Payloads

A webhook can send a custom body written as a Mustache template, optionally in a non-JSON
format with a matching `Content-Type` header. A custom payload replaces the default fields, so
`entity_type` and `event_type` only appear if your template includes them. Handlers that
dispatch on them should acknowledge bodies without them rather than fail.

## Full Event Reference

See [DatoCMS's webhook documentation](https://www.datocms.com/docs/general-concepts/webhooks) and
the [webhook resource](https://www.datocms.com/docs/content-management-api/resources/webhook).
