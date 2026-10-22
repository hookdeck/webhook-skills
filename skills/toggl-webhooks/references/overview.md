# Toggl Track Webhooks Overview

## What Are Toggl Track Webhooks?

The Toggl Track Webhooks API lets you create **subscriptions** that notify a URL when entities in a workspace change (time entries, projects, clients). Each subscription belongs to one workspace and one creator, has a description, a secret, one or more event filters, a `url_callback`, and an enabled and validated status. Events the creator can't see are not delivered. Webhooks API base URL: `https://api.track.toggl.com/webhooks/api/v1`.

Plan limits per workspace: Free 1 webhook (3 events), Starter 2 (6 events), Premium 3 (12 events); higher on Enterprise.

## Event Types

Events are identified by an **entity** and an **action**. Subscriptions filter on `{"entity": ..., "action": ...}`; `*` matches all. The delivered event carries the same pair in `metadata.model` and `metadata.action`. This skill's handlers dispatch on `<model>.<action>`.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `time_entry.created` | A time entry is created | Sync to billing or payroll |
| `time_entry.updated` | A time entry is edited | Keep external timesheets current |
| `time_entry.deleted` | A time entry is deleted | Remove from external systems |
| `project.created` | A project is created | Provision matching project elsewhere |
| `project.updated` | A project is edited | Sync project metadata |
| `project.deleted` | A project is deleted | Archive externally |
| `ping` | You call the ping endpoint, or validation runs | Test delivery, validate subscription |

Other entities (for example `client`) use the same `created` / `updated` / `deleted` actions. The authoritative list is `GET https://api.track.toggl.com/webhooks/api/v1/event_filters`.

## Event Payload Structure

```json
{
  "event_id": 42,
  "creator_id": 6,
  "metadata": { "action": "created", "model": "time_entry", "event_user_id": 6, "request_type": "POST" },
  "payload": { "...": "the entity" },
  "subscription_id": 6,
  "timestamp": "2024-01-01T00:00:00Z",
  "url_callback": "https://example.com/webhooks/toggl"
}
```

The PING event has `payload: "ping"` (a string) and, for a non-validated subscription, a `validation_code`. Exact `payload` fields per entity are not spelled out on the webhook pages; log a real delivery before relying on them.

`timestamp` is when the server sent *this attempt*; it changes on retries. Non-2xx responses are retried later.

## Full Event Reference

See [Toggl Track webhooks documentation](https://engineering.toggl.com/docs/track/webhooks_start/).
