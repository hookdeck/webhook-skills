# Velt Webhooks Overview

## What Are Velt Webhooks?

[Velt](https://velt.dev) is an SDK for in-app collaboration: comments, huddles, CRDT sync, recordings and
review workflows. Its webhooks notify your backend when users act in your app, so you don't have to poll.

Velt has two kinds:

- **Advanced (V2)** webhooks, [documented here](https://docs.velt.dev/webhooks/advanced), are available to
  Enterprise customers only. They are delivered through Svix and signed with
  [Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks) headers (`webhook-id`,
  `webhook-timestamp`, `webhook-signature`). You add endpoints in the Velt console and choose event types.
- **Basic (V1)** webhooks are not signed. They send an optional auth token in the `Authorization` header
  as `Basic <token>`, so Hookdeck's Velt source reports that they fail verification.

This skill covers Advanced (V2). Deliveries are JSON `POST` requests by default.

## Common Event Types

33 events are documented, and the list may not be exhaustive. The name is the top-level `event` field. The
examples handle all of these:

| Event | Triggered When |
|-------|----------------|
| `comment_annotation.add` | A comment thread is created with its first comment |
| `comment_annotation.assign` | A thread is assigned to a user |
| `comment_annotation.status_change` | A thread's status changes (open, in progress, resolved) |
| `comment_annotation.priority_change` | A thread's priority changes |
| `comment_annotation.custom_list_change` | A custom list item is added to or changed on a thread |
| `comment_annotation.subscribe` | A user subscribes to a thread's notifications |
| `comment_annotation.unsubscribe` | A user unsubscribes from a thread's notifications |
| `comment_annotation.accept` | A moderator accepts a thread (Moderator Mode only) |
| `comment_annotation.reject` | A moderator rejects a thread (Moderator Mode only) |
| `comment_annotation.approve` | A moderator approves a thread (Moderator Mode only) |
| `comment_annotation.suggestion_accept` | A suggestion is accepted (opt-in, disabled by default) |
| `comment_annotation.suggestion_reject` | A suggestion is rejected (opt-in, disabled by default) |
| `comment.add` | A comment is added to a thread |
| `comment.update` | A comment's content or metadata is modified |
| `comment.delete` | A comment is permanently removed from a thread |
| `comment.reaction_add` | A user adds an emoji reaction to a comment |
| `comment.reaction_delete` | A user removes their reaction from a comment |
| `huddle.create` | A user creates a huddle |
| `huddle.join` | A user joins a huddle |
| `crdt.update_data` | CRDT data is updated (enabled by default, 5-second debounce) |
| `recorder.done` | A recording finishes processing, with or without transcription (enabled by default) |
| `execution.dispatched` | A review workflow execution is created and its first step(s) are scheduled |
| `execution.completed` | All steps are completed with no unhandled failures |
| `execution.failed` | A blocking step ends `failed` or `breached` with no recovery edge |
| `execution.cancelled` | An execution is cancelled via API or full-execution rollback |
| `step.awaiting-approval` | A step enters `waiting` (human, running agent or async webhook step) |
| `step.completed` | A step completes |
| `step.failed` | A step fails (retry budget exhausted) |
| `step.breached` | A step exceeds its SLA before completing |
| `step.cancelled` | A step is cancelled via API or by a quorum-met side effect |
| `group.quorum-met` | A parallel group's approval threshold is first satisfied |
| `loop.iteration-started` | A rejected iteration spawns the next one below the `maxIterations` cap |
| `loop.exhausted` | A loop region hits its `maxIterations` cap |

Velt also sends `message.attempt.exhausted` when a message has used all its retries.

## Event Payload Structure

The default payload is `WebhookV2Payload`:

```json
{
  "actionType": "updateData",
  "data": {
    "actionUser": { "userId": "michael", "name": "Michael Scott", "organizationId": "crdt-array-demo-org1" },
    "crdtData": { "id": "crdt-array-demo-todos-1", "lastUpdatedBy": "michael", "data": [] },
    "metadata": {
      "apiKey": "VKabul7W2DJhLu1BiMaj",
      "document": { "documentId": "crdt-array-demo-doc-1", "documentName": "CRDT Array Demo" },
      "organization": { "organizationId": "crdt-array-demo-org1" },
      "pageInfo": { "url": "http://localhost:5225/", "path": "/", "title": "CRDT Array Demo" }
    }
  },
  "event": "crdt.update_data",
  "platform": "sdk",
  "source": "crdt",
  "webhookId": "-OnuSfG_ffGIwNkodE2a"
}
```

| Field | Meaning |
|-------|---------|
| `event` | The event type, for example `comment.add` |
| `actionType` | The verb, for example `add` or `updateData` |
| `source` | The feature that produced the event, for example `comment` or `crdt` |
| `platform` | Where it came from, for example `sdk` |
| `webhookId` | An id carried in the body. Use the `webhook-id` header for deduplication |
| `data.actionUser` | The user who acted |
| `data.commentAnnotation`, `data.crdtData`, ... | The feature object. Comment events carry the thread and its `comments` |
| `data.metadata` | `apiKey`, `document`, `organization` and `pageInfo` |

If you configured notification settings, per-user preferences (`usersOrganizationNotificationsConfig` or
`usersDocumentNotificationsConfig`) are added to the payload.

### Encoded and encrypted payloads

Both are opt-in. With Base64 encoding on you get `WebhookV2PayloadEncoded`, and with encryption on you get
`{ "encryptedData", "encryptedKey", "iv" }` (AES-256-CBC, key wrapped with RSA-OAEP SHA-256). Neither has
a top-level `event`, and the signature still covers the raw delivered body. The examples acknowledge such a
delivery after verifying it; decode or decrypt it before dispatching.

## Full Event Reference

See the [Advanced webhooks documentation](https://docs.velt.dev/webhooks/advanced), which links the payload
data models (`WebhookV2Payload`, `CommentPayload`, `HuddlePayload`, `CRDTPayload`, `RecorderPayload`).
