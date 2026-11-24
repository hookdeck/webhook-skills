# Memos Webhooks Overview

## What Are Memos Webhooks?

[Memos](https://usememos.com) is an open-source, self-hosted note-taking app. Webhooks are configured per user in the Settings page and can be edited or deleted later. When a memo changes, Memos POSTs a JSON event to each of that user's webhook URLs. Since v0.30.0 each delivery is signed in the Standard Webhooks format when the webhook has a signing secret; older webhooks stay unsigned until a secret is generated in the edit dialog.

## Common Event Types

| Event (`activityType`) | Triggered When | Common Use Cases |
|------------------------|----------------|------------------|
| `memos.memo.created` | A memo is created | Sync new notes to a search index, chat channel or backup |
| `memos.memo.updated` | A memo is updated | Refresh a copy, re-run a classifier |
| `memos.memo.deleted` | A memo is deleted | Remove the mirrored copy |
| `memos.memo.comment.created` | A comment is added to a memo | Notify the memo owner, thread the conversation elsewhere |

The documentation describes four dispatch points (memo created, updated, deleted, comment created) and does not name the `activityType` strings. The values above are the strings the 26.11.2 dispatchers pass (unchanged since v0.31.0). The list may not be exhaustive, so ignore types you don't recognise (but still acknowledge them). There is no per-event selection: a webhook receives every one of these.

## Event Payload Structure

| Field | Meaning |
|-------|---------|
| `url` | The destination URL the webhook was sent to (in Memos's payload struct; not named in the docs) |
| `activityType` | The event name. Route on this |
| `creator` | The memo creator's resource name, `users/{user}` (from the source's struct comment) |
| `memo` | The affected memo. On comment-created events it is the comment: from 26.11.2 read `memo.parent` to identify the conversation; earlier releases put the parent in `memo.relations` |

The docs name `activityType`, `creator` and `memo` but not the fields inside `memo`, and Memos publishes no example body. The body has no event id: deduplicate on the `webhook-id` header.

## Headers

Signed deliveries carry `webhook-id` (a unique ID beginning with `msg_`), `webhook-timestamp` (Unix seconds) and `webhook-signature` (`v1,<base64 HMAC>`). The sender sets `Content-Type: application/json`. See [verification.md](verification.md).

## The Response Memos Expects

Return a 2xx status **and** a JSON body whose `code` is `0`:

```json
{ "code": 0 }
```

A non-2xx status, invalid JSON or a nonzero `code` is a failed delivery, so a plain `200 OK` with an empty body fails. Memos's sender times out after 30 seconds and doesn't retry a failed delivery.

## Full Event Reference

See [Memos' webhook documentation](https://usememos.com/docs/integrations/webhooks).
