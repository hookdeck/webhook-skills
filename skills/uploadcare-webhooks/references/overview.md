# Uploadcare Webhooks Overview

## What Are Uploadcare Webhooks?

Uploadcare notifies your application asynchronously about events in a project by sending a `POST`
with a JSON payload to the endpoint you register. Webhooks are per project, created in the
dashboard (Webhooks section) or via the REST API, and each is pinned to a REST API version (v0.6 or
v0.7) that decides the available events and the payload shape.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `file.uploaded` | A new file is uploaded, a local copy is created, or processing (video encoding, document conversion, background removal) creates a file | Save a record, start moderation |
| `file.info_updated` | A file's `metadata` changes, or its `appdata` is updated (e.g. by an add-on) | Sync metadata, react to add-on results |
| `file.deleted` | A file is removed | Delete your matching record |
| `file.stored` | A file is stored | Mark an upload as permanent |
| `file.infected` | The malware scan flags a file (to be deprecated in favor of `file.info_updated`) | Quarantine or remove the file |

REST API v0.6 supports only `file.uploaded`.

## Event Payload Structure

| Key | Type | Description |
|-----|------|-------------|
| `hook` | object | Webhook, event and project information; `hook.event` is the event name |
| `data` | object | The file the event is about |
| `file` | string | CDN URL of the file |
| `initiator` | object | v0.7 only. `type` is `addon`, `api` or `system`, plus `detail` |

v0.7 `data` also has `appdata`, `content_info` and `metadata`.

## Delivery and Retries

Only a `2xx` response succeeds; an attempt times out after one minute. Retries run 1, 5, 10, 30 and
60 minutes after the first attempt, then hourly within 72 hours. After that the webhook is disabled
and the project owner is emailed.

## Full Event Reference

See [Uploadcare's webhook documentation](https://uploadcare.com/docs/webhooks/).
