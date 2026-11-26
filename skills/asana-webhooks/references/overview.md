# Asana Webhooks Overview

## What Are Asana Webhooks?

Asana webhooks let your application receive real-time notifications when resources
(tasks, projects, stories, sections, tags, portfolios, goals, and more) change. You
create a webhook against a specific **resource** — for example a project or a task —
and Asana POSTs a batch of events to your `target` URL whenever something happens to
that resource or its children.

Unlike many providers, Asana events are **compact**: each event tells you *what kind
of change happened to which resource*, not the full new state. To get details (the
new task name, the changed field value, etc.) you make a follow-up call to the Asana
API using the resource `gid`.

## The Two Request Types

Every request Asana sends is a `POST` to your `target`. Distinguish them by headers:

| Request | Distinguishing header | What to do |
|---------|----------------------|------------|
| **Handshake** (once, at creation) | `X-Hook-Secret` present, no `X-Hook-Signature` | Echo `X-Hook-Secret` back as a response header, store the secret, return `200` |
| **Event delivery** (ongoing) | `X-Hook-Signature` present | Verify the signature with the stored secret, then process `events` |

## Common Event Actions

Each event object has an `action` describing what happened:

| Action | Triggered When | Common Use Cases |
|--------|----------------|------------------|
| `added` | A resource is created or added to a parent (task added to a project, story added to a task) | Sync new tasks, trigger onboarding flows |
| `changed` | A field on a resource changes (name, due date, `completed`, assignee) | Update mirrors, send notifications on completion |
| `removed` | A resource is removed from a parent but still exists elsewhere | Keep project membership in sync |
| `deleted` | A resource is deleted (moved to trash) | Archive or soft-delete in your system |
| `undeleted` | A previously deleted resource is restored | Reverse an archive |

## Event Payload Structure

The body is always a JSON object with a single `events` key:

```json
{
  "events": [
    {
      "action": "changed",
      "resource": { "gid": "12345", "resource_type": "task" },
      "parent": null,
      "user": { "gid": "12345", "resource_type": "user" },
      "created_at": "2012-02-22T02:06:58.147Z",
      "change": {
        "field": "assignee",
        "action": "changed",
        "new_value": { "gid": "12345", "resource_type": "user" }
      }
    }
  ]
}
```

Fields:

- `action` — one of `added`, `changed`, `removed`, `deleted`, `undeleted`
- `resource` — the object that changed (`{ gid, resource_type }`)
- `parent` — for `added` and `removed` events, the parent the resource was added to or removed from; `null` otherwise
- `user` — who caused the change (may be `null` for system changes)
- `created_at` — ISO 8601 timestamp of the change
- `change` — present when `action` is `changed`; names the field and how it changed

## Heartbeats

Asana sends **heartbeat** deliveries with an empty array — `{"events": []}` — at the
handshake and roughly every 8 hours. They keep the connection marked healthy. Verify
their signature and return `200` like any other delivery; there is nothing to process.

If Asana receives **no successful response for 24 hours**, it deletes the webhook.

## Delivery Semantics

- **Timing:** ~1 minute on average, up to ~10 minutes.
- **Retries:** any response other than `200` or `204`, or one slower than 10 seconds, is a
  failed delivery. Asana retries with exponential backoff for up to 24 hours, then deletes
  the webhook.
- **At-most-once:** there is no replay. Return `200` quickly and do heavy work async.
- **Signal deletion:** respond with `410 Gone` to tell Asana to delete the webhook.

## Limits

- 1,000 webhooks per resource.
- 10,000 webhooks per authentication token.

## Full Event Reference

For the complete list of resources and events, see the
[Asana Webhooks Guide](https://developers.asana.com/docs/webhooks-guide).
