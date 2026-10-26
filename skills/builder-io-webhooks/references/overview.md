# Builder.io Webhooks Overview

## What Are Builder.io Webhooks?

Builder.io model webhooks let your app react to content changes: store the changed content in a
database, bust a CDN cache, or kick off a build. You add one or more URLs to a model, and Builder
POSTs JSON to each URL whenever content in that model is published, unpublished, archived or
deleted, or when a scheduled publish starts or ends.

Webhooks are **not signed**. Authenticate them with a secret custom header you add to the webhook
(see [setup.md](setup.md) and [verification.md](verification.md)).

## Operations

The `operation` field says what happened. These are the exact values from the Builder.io docs:

| `operation` | Triggered When | Common Use Cases |
|-------------|----------------|------------------|
| `publish` | Content is published (`previousValue` is `null` on a first publish) | Sync to a database, bust a cache, trigger a rebuild |
| `unpublish` | Content is unpublished | Remove the page from search or a CDN |
| `archive` | Content is archived | Hide or retire the entry downstream |
| `delete` | Content is deleted (`newValue` is `null`) | Delete the mirrored record |
| `scheduledStart` | A scheduled publish window starts | Warm caches for content going live |
| `scheduledEnd` | A scheduled publish window ends | Expire content downstream |

## Payload Structure

```json
{
  "newValue": {
    "id": "cs3df",
    "published": "draft",
    "name": "My great page",
    "data": { "property": "value" }
  },
  "previousValue": { "...": "..." },
  "modelName": "page",
  "operation": "publish"
}
```

| Field | Meaning |
|-------|---------|
| `newValue` | The content entry after the change; `null` on `delete` |
| `previousValue` | The entry before the change; `null` on a first publish |
| `modelName` | The model the entry belongs to, for example `page` |
| `operation` | One of the values above |

Per-webhook advanced settings can change the body: **Disable payload** sends the POST with no data,
and **Submit limited payload fields** includes only the fields you list. Don't assume `newValue` is
fully populated.

## Full Reference

See [Builder.io's model webhooks documentation](https://www.builder.io/c/docs/webhooks).
