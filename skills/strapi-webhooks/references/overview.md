# Strapi Webhooks Overview

## What Are Strapi Webhooks?

A Strapi webhook is a user-defined HTTP callback. When content changes, Strapi POSTs a JSON
payload to a URL you configure, typically to start a CI build, redeploy a site, or sync a search
index. You manage webhooks in the admin panel (Settings > Webhooks), and set global options in
`./config/server`.

Requests are **not signed**. Strapi's webhook runner sends only the headers you configure plus
`X-Strapi-Event`. To authenticate requests, add a secret header per webhook, or add it to every
webhook with `webhooks.defaultHeaders`. Strapi's docs also describe HMAC signing with an
`X-Webhook-Signature` header, but that is guidance for a sender you build yourself, not something
Strapi sends.

Webhooks never fire for the User content-type. Private fields are not included in payloads.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `entry.create` | A Content Type entry is created | Index new content |
| `entry.update` | An entry is updated | Refresh caches |
| `entry.delete` | An entry is deleted | Remove from search or CDN |
| `entry.publish` | An entry is published (Draft & Publish only) | Rebuild or revalidate a site |
| `entry.unpublish` | An entry is unpublished (Draft & Publish only) | Take pages down |
| `entry.draft-discard` | A draft is discarded and restored from the published version | Refresh previews |
| `media.create` | A file is uploaded | Sync assets |
| `media.update` | A file is replaced or its metadata is updated | Refresh cached assets |
| `media.delete` | A file is deleted through the media interface | Purge from CDN |
| `review-workflows.updateEntryStage` | Content moves to a new review stage (Enterprise) | Notify reviewers |
| `releases.publish` | A release is published (Growth and Enterprise) | Trigger a deployment |

`entry.draft-discard` isn't listed in the admin panel's webhook form; subscribing to it requires
creating the webhook programmatically. Publishing an entry from the admin panel saves the draft
first, so `entry.update` is sent just before `entry.publish`.

## Event Payload Structure

Header: `X-Strapi-Event: <event>`, with the same value as the body's `event`.

| Events | Top-level properties |
|--------|----------------------|
| `entry.*` | `event`, `createdAt`, `model`, `uid`, `entry` |
| `media.*` | `event`, `createdAt`, `media` (no `model` or `uid`) |
| `review-workflows.updateEntryStage` | `event`, `createdAt`, `model`, `uid`, `entity`, `workflow` |
| `releases.publish` | `event`, `createdAt`, `isPublished`, `release` |

Inside `entry`, `documentId` identifies the document while `id` identifies the version the event
is about. A draft and its published version share a `documentId` but have different `id` values.
For `entry.delete` and `entry.unpublish` the entry isn't re-read, so it may carry fewer fields.

Example `entry.publish` payload (from the docs):

```json
{
  "event": "entry.publish",
  "createdAt": "2026-09-09T08:49:28.619Z",
  "model": "address",
  "uid": "api::address.address",
  "entry": {
    "id": 2,
    "documentId": "w7vfs319acmaxnurjk5vaaza",
    "city": "Paris 1er",
    "postalCode": "75001",
    "createdAt": "2026-09-09T08:49:26.150Z",
    "updatedAt": "2026-09-09T08:49:28.603Z",
    "publishedAt": "2026-09-09T08:49:28.607Z"
  }
}
```

## Full Event Reference

See [Strapi's webhook documentation](https://docs.strapi.io/cms/backend-customization/webhooks).
