# Heroku Webhooks Overview

## What Are Heroku Webhooks?

Heroku **app webhooks** notify your server when something changes on an app, pipeline, or add-on: a release is created, a build finishes, a dyno starts, formation is scaled. You create a subscription with `heroku webhooks:add`, choosing the entities to watch (`-i`), the endpoint (`-u`), and a delivery level (`-l`).

Delivery levels:

- `notify` — one attempt per event; failed deliveries are not retried.
- `sync` — failed deliveries are retried until they succeed or the retry limit is reached. Notifications are ordered, so retries delay later events. Retries stop after 72 hours.

Each app, add-on, or pipeline can have up to 10 independent subscriptions. A webhook that fails continuously for a week is deleted and the owner is emailed.

## Common Event Types

Entities you subscribe to, and the actions Heroku emits for each:

| Entity (`-i`) | Actions | Common Use Cases |
|---------------|---------|------------------|
| `api:addon-attachment` | `create`, `destroy` | Track add-on attach/detach |
| `api:addon` | `create`, `destroy`, `update` | Add-on inventory |
| `api:app` | `create`, `destroy`, `update` | App lifecycle, inventory sync |
| `api:build` | `create`, `update` | Build progress, failure alerts |
| `api:collaborator` | `create`, `destroy`, `update` | Access auditing |
| `api:domain` | `create`, `destroy` | Domain changes |
| `api:dyno` | `create` | Dyno activity |
| `api:formation` | `destroy`, `update` | Scaling changes |
| `api:release` | `create`, `update` | Deploy notifications (release phase yields create, update, update) |
| `api:sni-endpoint` | `create`, `destroy`, `update` | TLS endpoint changes |

## Event Payload Structure

```json
{
  "action": "update",
  "actor": { "email": "dev@example.com", "id": "..." },
  "created_at": "2016-10-26T22:50:14Z",
  "id": "d472a8bb-1a3c-4f78-aad1-995e6d0022ec",
  "data": { "name": "myapp", "...": "entity fields" },
  "previous_data": {},
  "published_at": null,
  "resource": "app",
  "sequence": null,
  "updated_at": "2016-10-26T22:50:14Z",
  "version": "application/vnd.heroku+json; version=3",
  "webhook_metadata": {
    "attempt":  { "id": "..." },
    "delivery": { "id": "..." },
    "event":    { "id": "...", "include": "api:app" },
    "webhook":  { "id": "..." }
  }
}
```

- `resource` names the entity and `action` is `create`, `update`, or `destroy`. The docs example shows `"resource": "app"` while subscriptions use `api:app`, so the example handlers strip an optional `api:` prefix.
- `data` is the entity as the Heroku Platform API would return it.
- `id` (also `webhook_metadata.event.id`) is the event ID; use it for idempotency. `webhook_metadata.delivery.id` changes per attempt.

## Request Headers

| Header | Meaning |
|--------|---------|
| `Heroku-Webhook-Hmac-SHA256` | Base64 HMAC-SHA256 of the raw body |
| `Authorization` | Only present if you set `--authorization`; passed through unmodified |

## Full Event Reference

See [Heroku App Webhooks](https://devcenter.heroku.com/articles/app-webhooks).
