# Lokalise Webhooks Overview

## What Are Lokalise Webhooks?

Lokalise sends an HTTP POST with a JSON body to your URL whenever a subscribed event happens
in a project (a translation changes, keys are added, a task closes, files are imported). You
install the **Webhooks** app in a project, give it a URL, choose events, and optionally
choose which header carries the secret.

Lokalise does not sign requests. Every delivery carries the webhook secret in a header
(`X-Secret` by default) plus identifier headers (`Project-Id`, `Webhook-Id`, and `X-Event`
with the event name).

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `project.translation.updated` | A translation was modified | Sync a changed string to your app or CDN |
| `project.translations.updated` | Translations changed in a bulk action (e.g. translation memory applied) | Bulk sync; `action` says what caused it |
| `project.key.added` | A key was added | Track new strings |
| `project.keys.added` | Keys were added in bulk (up to 300 per event) | Register new keys |
| `project.key.modified` / `project.keys.modified` | A key (or keys, in bulk) were modified | Refresh key metadata |
| `project.keys.deleted` | Keys were deleted | Remove strings from your app |
| `project.task.closed` | A task was closed, manually or on completion | Pull finished translations |
| `project.imported` | Translation files were uploaded | Re-run validation or build |

Other events from the docs: `project.exported`, `project.copied`, `project.snapshot`,
`project.branch.added`, `project.branch.deleted`, `project.branch.merged`,
`project.languages.added`, `project.language.removed`, `project.language.settings_changed`,
`project.key.comment.added`, `project.translation.proofread`,
`project.translations.proofread`, `project.contributor.added`,
`project.contributor.added_public`, `project.contributor.deleted`, `project.task.created`,
`project.task.queued`, `project.task.deleted`, `project.task.language.closed`,
`project.task.initial_tm_leverage.calculated`, `team.order.created`, `team.order.deleted`,
`team.order.completed`.

## Event Payload Structure

```json
{
  "event": "project.translation.updated",
  "translation": { "id": 84835169, "value": "Hello, %s!", "previous_value": "Hi!", "segment": 1 },
  "language": { "id": 640, "iso": "en", "name": "English" },
  "key": { "id": 16307701, "name": "test.title" },
  "project": { "id": "138c1ffa0ad94848f01f980e7f2f2af19d1bd553", "name": "TheApp Project", "branch": "master" },
  "user": { "email": "john@example.com", "full_name": "John Doe" },
  "created_at": "2019-07-29 12:18:31",
  "created_at_timestamp": 1564395511
}
```

- Every payload has `event`, `project` (with `branch`) and `created_at_timestamp`.
- Bulk events (`*.keys.*`, `project.translations.*`) carry arrays and an `action` field
  (`api`, `bulk.tm`, `import.file`, `replace.translations`, ...). More than 300 objects are
  split across several events.
- Moving or copying keys between projects fires `project.keys.added` on the destination and
  `project.keys.deleted` on the source.

## The Setup Ping

When a webhook handler is created, Lokalise sends a ping to the URL. The endpoint must return a
`2xx` for it (Lokalise requires a 2xx for every notification, ping included). The ping's body isn't documented, so the examples
acknowledge any authenticated request that isn't a JSON event.

## Delivery and Retries

Respond with a `2xx` within 8 seconds. On failure Lokalise retries after about 1, 5, 10, 20
and 30 minutes, then hourly for up to 24 hours (order is best effort). After 24 hours the
queued events are dropped and the handler is disabled until you re-enable it in the project
settings. Make handlers idempotent.

## Full Event Reference

See [Lokalise's webhook events documentation](https://developers.lokalise.com/docs/webhook-events)
and the [webhooks guide](https://developers.lokalise.com/docs/webhooks-guide).
