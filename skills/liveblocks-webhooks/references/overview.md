# Liveblocks Webhooks Overview

## What Are Liveblocks Webhooks?

[Liveblocks](https://liveblocks.io) is realtime collaboration infrastructure: rooms, Storage, Yjs documents, Comments and notifications. It sends an HTTP POST with a JSON body to every webhook endpoint you add in your project's **Webhooks** dashboard whenever users or systems change Liveblocks data. Deliveries follow the [Standard Webhooks](https://standardwebhooks.com/) specification and are signed with the endpoint's `whsec_` secret.

Each endpoint listens to all events by default. Narrow it with **Message Filtering** (the event selection in the endpoint form). The dashboard's Event Catalog lists the events available for subscription with their schemas.

## Event Payload Structure

Every body is `{ type, data }`:

```json
{
  "type": "storageUpdated",
  "data": {
    "projectId": "my-project-id",
    "roomId": "my-room-id",
    "updatedAt": "2021-10-06T01:45:56.558Z"
  }
}
```

| Field | Meaning |
|-------|---------|
| `type` | The camelCase event type, for example `storageUpdated`. This is what handlers switch on |
| `data` | Event-specific fields. `projectId` and `roomId` are on every event except a custom notification, whose `roomId` can be `null` |

There is no event id in the body. The `webhook-id` header is unique per message and stable across retries, so it is the idempotency key.

## Common Event Types

| Event | Triggered When | `data` fields |
|-------|----------------|---------------|
| `userEntered` | A user connects to a room | `connectionId`, `userId` (or `null`), `userInfo` (or `null`), `enteredAt`, `numActiveUsers` |
| `userLeft` | A user disconnects from a room | `connectionId`, `userId`, `userInfo`, `leftAt`, `numActiveUsers` |
| `storageUpdated` | A user writes to Storage. Throttled at 60 s | `updatedAt` |
| `roomCreated` | A room is created by the API or by a user connecting to a missing room | `createdAt` |
| `roomDeleted` | A room is deleted | `deletedAt` |
| `ydocUpdated` | A Yjs document in a room changes. Throttled at 60 s | `updatedAt` |
| `commentCreated` | A comment is created | `threadId`, `commentId`, `createdAt`, `createdBy` |
| `commentEdited` | A comment is edited | `threadId`, `commentId`, `editedAt` |
| `commentDeleted` | A comment is deleted | `threadId`, `commentId`, `deletedAt` |
| `commentReactionAdded` | A reaction is added to a comment | `threadId`, `commentId`, `emoji`, `addedAt`, `addedBy` |
| `commentReactionRemoved` | A reaction is removed from a comment | `threadId`, `commentId`, `emoji`, `removedAt`, `removedBy` |
| `commentMetadataUpdated` | A comment's metadata is updated | `threadId`, `commentId`, `updatedAt`, `updatedBy` |
| `threadCreated` | A thread is created | `threadId`, `createdAt`, `createdBy` |
| `threadDeleted` | All comments in a thread are deleted, or the thread is deleted | `threadId`, `deletedAt` |
| `threadMetadataUpdated` | A thread's metadata is updated | `threadId`, `updatedAt`, `updatedBy` |
| `threadMarkedAsResolved` | A thread is marked resolved | `threadId`, `updatedAt`, `updatedBy` |
| `threadMarkedAsUnresolved` | A thread is marked unresolved | `threadId`, `updatedAt`, `updatedBy` |
| `notification` | A user has an unseen notification; used to build notification emails | `channel` (`"email"`), `kind`, `userId`, `inboxNotificationId`, `createdAt`, `triggeredAt`, plus kind-specific fields |

`userEntered`, `userLeft`, the room, comment and thread events are not throttled. `storageUpdated` and `ydocUpdated` are: a burst of writes yields one event roughly 60 seconds after the first (Enterprise plans can raise the throttle), so don't treat them as a write log.

### Notification events

`notification` events fire 30 minutes after the activity by default (change this in the project's settings) and only if the user hasn't seen it. `data.kind` says which flavour you have:

| `data.kind` | Meaning | Extra fields |
|-------------|---------|--------------|
| `thread` | The user was mentioned or replied to in a thread, or subscribed to a thread, and hasn't seen it | `threadId` |
| `textMention` | The user was mentioned in a text editor document and hasn't seen it | `mentionId` |
| `$yourKind` | A custom notification you triggered from your server; any string starting with `$` | `roomId` can be `null` |

`createdAt` is when the webhook event was created; `triggeredAt` is when the notification itself was created.

## Full Event Reference

The 18 events above are the ones documented in the [Liveblocks webhook events reference](https://liveblocks.io/docs/api-reference/webhook-events). It notes that more will follow (for example `maxConnectionsReached`), so handlers should ignore types they don't recognise. For endpoint setup, retries and verification see the [webhooks guide](https://liveblocks.io/docs/platform/webhooks).
