# Onshape Webhooks Overview

## What Are Onshape Webhooks?

Onshape (PTC's cloud CAD and PDM platform) sends notifications as an HTTP `POST` with a JSON body whenever an event you subscribed to occurs, as an alternative to polling the REST API. Applications register a webhook with `POST /api/v6/webhooks`, giving the event types, a `url` and either a `companyId` (all present and future documents owned by the company) or a `documentId`. HTTPS URLs need a certificate signed by a recognised CA; self-signed certificates make delivery fail.

Onshape's documentation states no timeout or retry policy. Treat deliveries as at-least-once and de-duplicate on `messageId`. Webhooks you create are cleaned up after a period of inactivity unless you set `isTransient=false`.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `onshape.model.lifecycle.changed` | A model changes | Re-run exports, refresh a PDM copy |
| `onshape.model.translation.complete` | A translation (import/export) completes | Download the translated file |
| `onshape.document.lifecycle.created` | A document is created | Register it in your system |
| `onshape.document.lifecycle.statechange` | A document changes state (`ACTIVE`, `TRASH`, `DELETED`) | Archive or clean up |
| `onshape.revision.created` | A release revision is created | Sync releases to ERP/PLM |
| `onshape.comment.create` | A comment is created | Notify reviewers |
| `onshape.user.lifecycle.updateappsettings` | A user's app settings change (registered with `clientId`) | Re-read user settings |
| `webhook.register` | A webhook is registered | Sent automatically; return 200 |
| `webhook.ping` | `pingWebhook` is called, or Onshape validates after registration | Sent automatically; return 200 |
| `webhook.unregister` | A webhook is removed | Sent automatically; return 200 |

`onshape.document.lifecycle.statechange` registrations need a `documentId` and a `documentState`; `onshape.user.lifecycle.updateappsettings` needs a `clientId`. Other event types (document, model, comment, release, task, team and company events, 48 in all) are listed in the API Explorer under `createWebhook`.

## Event Payload Structure

Flat JSON, with the event type in `event`:

```json
{
  "timestamp": "2024-05-05T23:46:29.284-0500",
  "event": "onshape.model.lifecycle.changed",
  "workspaceId": "000000000000000000000000",
  "elementId": "000000000000000000000000",
  "webhookId": "000000000000000000000000",
  "messageId": "000000000000000000000000",
  "data": "Some data",
  "documentId": "000000000000000000000000",
  "versionId": "000000000000000000000000"
}
```

Event-specific fields: `translationId` and `userId` (translation complete), `documentState` (document state change), `commentId` (comment create), `userId` and `clientId` (app settings).

## Full Event Reference

See [Onshape's webhook documentation](https://onshape-public.github.io/docs/app-dev/webhook/) and the `createWebhook` endpoint in the API Explorer.
