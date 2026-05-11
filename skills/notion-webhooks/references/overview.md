# Notion Webhooks Overview

## What Are Notion Webhooks?

Notion webhooks let an internal integration receive HTTP POST notifications
when content in a connected workspace changes — instead of polling the API.
Webhooks are scoped to a Notion **integration** and a **subscription** that
selects which events to receive and which workspaces/pages they apply to.

Webhooks were introduced in the `2026-03-01` API release and use a one-time
`verification_token` handshake to prove ownership of the receiving endpoint.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `page.content_updated` | Blocks added, removed, or edited on a page | Sync to search index, mirror content |
| `page.properties_updated` | A page property value changed | Trigger workflow when status flips |
| `page.created` | New page created in a connected location | Track new docs, kick off onboarding |
| `page.deleted` | Page moved to trash | Garbage-collect mirrors, audit trails |
| `page.undeleted` | Page restored from trash | Re-add to mirrors |
| `page.locked` | Page becomes read-only | Compliance / publishing flows |
| `page.unlocked` | Page editing restrictions removed | Compliance / publishing flows |
| `page.moved` | Page moved to a new parent | Re-evaluate access, rebuild paths |
| `comment.created` | New comment or suggested edit added | Notifications, AI triage |
| `comment.updated` | Comment edited | Audit, sync |
| `comment.deleted` | Comment removed | Audit, sync |
| `database.created` | New database created | Index new structures |
| `database.moved` / `database.deleted` / `database.undeleted` | Database lifecycle | Mirror cleanup |
| `database.schema_updated` | Database schema changed (deprecated post-2022-06-28; use `data_source.schema_updated` from 2025-09-03) | Re-derive types |
| `data_source.created` | New data source created within a database (2025-09-03+) | Index new sources |
| `data_source.content_updated` | Data source content updated (2025-09-03+) | Sync rows |
| `data_source.schema_updated` | Data source schema changed (2025-09-03+) | Re-derive types |
| `data_source.moved` / `data_source.deleted` / `data_source.undeleted` | Data source lifecycle (2025-09-03+) | Mirror cleanup |

Most page/database/data_source events are **aggregated** — Notion may batch
multiple changes into a single delivery. `page.locked`, `page.unlocked`, and
`comment.*` events are not aggregated.

## Event Payload Structure

All Notion webhook payloads share the same envelope:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-03-01T12:34:56.000Z",
  "workspace_id": "11111111-2222-3333-4444-555555555555",
  "workspace_name": "Acme Inc",
  "subscription_id": "66666666-7777-8888-9999-000000000000",
  "integration_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  "type": "page.content_updated",
  "authors": [{ "id": "user-uuid", "type": "person" }],
  "accessible_by": [{ "id": "user-uuid", "type": "person" }],
  "attempt_number": 1,
  "entity": { "id": "page-uuid", "type": "page" },
  "data": { /* event-specific fields */ }
}
```

The `data` object varies by event. For example, `page.properties_updated`
includes the IDs of properties that changed; `page.moved` includes the old and
new parent.

## The Handshake Payload

The very first POST to a new subscription is the verification handshake. It
has **no `X-Notion-Signature` header** and the body is just:

```json
{ "verification_token": "secret_REPLACE_WITH_VALUE_FROM_NOTION_HANDSHAKE" }
```

The receiver must surface this token (log, dashboard, etc.) so the developer
can paste it into the Notion integration UI to activate the subscription. From
that point on, every delivery is signed using this token as the HMAC key.

## Full Event Reference

For the complete list of events and field-level payload definitions, see:
- [Notion Webhooks](https://developers.notion.com/reference/webhooks)
- [Webhook Events & Delivery](https://developers.notion.com/reference/webhooks-events-delivery)
