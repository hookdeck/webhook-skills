# Featurebase Webhooks Overview

## What Are Featurebase Webhooks?

[Featurebase](https://featurebase.app) sends an HTTP `POST` with a JSON body to your server when something changes: a new Request, a status change, a reply in a conversation. Webhooks need the Growth plan or higher. A workspace can have up to 10 webhooks, and each one has its own signing secret and topic list.

## Common Event Types

Every event has a `topic` field. These are the 27 topics from the [webhook events reference](https://help.featurebase.app/api-reference/1022304-webhook-events-reference).

| Topic | Triggered When | `data.item` |
|-------|----------------|-------------|
| `post.created` | A Request was created | Post |
| `post.updated` | A Request changed (title, content, status, board, tags). Has `data.changes` | Post |
| `post.deleted` | A Request was deleted | Post as it was before deletion |
| `post.voted` | Someone added or removed an upvote | `post_vote` (`action` is `add` or `remove`, `postId`, `voter`) |
| `ticket.created` | A ticket was created | Ticket (no `ticketUrl`) |
| `ticket.updated` | A ticket changed. Has `data.changes` | Ticket |
| `ticket.deleted` | A ticket was deleted | Ticket |
| `comment.created` | A comment was posted (Updates comments have `changelogId` instead of `postId`) | Comment |
| `comment.updated` | A comment was edited. Has `data.changes` | Comment |
| `comment.deleted` | A comment was deleted | Comment |
| `changelog.published` | An Update was published. One event per published language (`locale`) | Changelog |
| `conversation.user.created` | A customer started a conversation | Conversation |
| `conversation.admin.assigned` | The conversation was assigned to a teammate or team | Conversation |
| `conversation.admin.closed` | A teammate closed the conversation | Conversation |
| `conversation.admin.opened` | A teammate reopened the conversation | Conversation |
| `conversation.admin.snoozed` | A teammate snoozed it (`snoozedUntil`) | Conversation |
| `conversation.admin.unsnoozed` | Unsnoozed by a teammate or when the snooze ended | Conversation |
| `conversation.priority.updated` | The priority changed | Conversation |
| `conversation.handover_requested` | The AI agent handed the conversation to a human | Conversation |
| `conversation.contact.attached` | A contact was added to the conversation | Conversation |
| `conversation.contact.detached` | A contact was removed from the conversation | Conversation |
| `conversation.read` | The conversation was marked as read | Conversation |
| `conversation.deleted` | The conversation was deleted | Conversation |
| `conversation.user.replied` | A customer replied (`partType` `user_msg` or `email_msg`) | Conversation part |
| `conversation.admin.replied` | A teammate or the AI agent replied | Conversation part |
| `conversation.admin.noted` | A teammate added an internal note | Conversation part |
| `conversation_part.redacted` | A teammate redacted a message (`redacted: true`) | Conversation part |

The conversation topics other than `conversation.user.created` and `conversation.deleted` include `data.changes`. Message topics never do.

## Event Payload Structure

```json
{
  "object": "notification_event",
  "id": "notif_019a1c2e-5b7d-7f3a-9c41-2d8e6f0a1b23",
  "topic": "post.updated",
  "organizationId": "6595518396205e06b897ad65",
  "webhookId": "675346db13af7340748ce850",
  "createdAt": "2026-10-09T12:00:00.000Z",
  "data": {
    "object": "notification_event_data",
    "item": { "object": "post", "id": "67546dfb6e1363426b90707f", "title": "Dark mode for the dashboard" },
    "changes": [{ "field": "status.name", "oldValue": "In Review", "newValue": "Completed" }]
  }
}
```

Conversation and message events also carry `conversationId` and `conversationUrl` at the top level. `data.item` uses your workspace's default API version.

## Delivery

- Return `200`, `201`, `202` or `204` within 5 seconds. Anything else counts as a failure. The API can raise the timeout to 30 seconds.
- Up to 3 retries. The event `id` is the same on every attempt.
- A webhook is paused after 100 consecutive failures (5 minutes, doubling up to 4 hours) and disabled after 500 failures or 3 pauses in 24 hours. Events are not kept while it is paused or disabled.

## Full Event Reference

See [Featurebase's webhook events reference](https://help.featurebase.app/api-reference/1022304-webhook-events-reference) for example payloads of each kind.
