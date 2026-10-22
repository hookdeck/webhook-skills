# Exa Webhooks Overview

## What Are Exa Webhooks?

Exa's Websets API can push events to your HTTPS endpoint as a Webset runs: when it is created, when searches finish, when items are found and enriched. You register a webhook with `POST /v0/webhooks` (base URL `https://api.exa.ai/websets`), choosing which events it receives. Every delivery is signed with `Exa-Signature`.

The same signing scheme is used by Monitors, which deliver `monitor.*` events.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `webset.created` | A new Webset is created | Audit, bookkeeping |
| `webset.idle` | A Webset has no running operations | Fetch final results, mark a job done |
| `webset.search.completed` | A search finishes finding all items | Trigger enrichment or export |
| `webset.item.created` | A new item is added to the Webset | Stream items into a CRM or database |
| `webset.item.enriched` | An item's enrichment completes | Sync enriched fields downstream |

All events Exa lists (a webhook can subscribe to up to 19):

| Group | Events |
|-------|--------|
| Webset | `webset.created`, `webset.deleted`, `webset.paused`, `webset.idle` |
| Search | `webset.search.created`, `webset.search.updated`, `webset.search.completed`, `webset.search.canceled` |
| Item | `webset.item.created`, `webset.item.enriched` |
| Import | `import.created`, `import.completed` |
| Export | `webset.export.created`, `webset.export.completed` |
| Monitor | `monitor.created`, `monitor.updated`, `monitor.deleted`, `monitor.run.created`, `monitor.run.completed` |

## Event Payload Structure

```json
{
  "id": "event_id",
  "object": "event",
  "type": "webset.item.created",
  "data": { "id": "item_id", "object": "webset_item" },
  "createdAt": "2026-01-01T00:00:00Z"
}
```

- `id` is unique per event; use it for idempotency.
- `data` is the full resource that triggered the event.
- Events are kept for 60 days and can be listed through the events API.

## Full Event Reference

See [Exa's event types](https://exa.ai/docs/websets/api/events/types) and [create a webhook](https://docs.exa.ai/websets/api/webhooks/create-a-webhook).
