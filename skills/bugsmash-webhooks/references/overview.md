# BugSmash Webhooks Overview

## What Are BugSmash Webhooks?

BugSmash (bugsmash.io) is a visual feedback and review tool for websites, images, video and
documents. A BugSmash **workspace webhook** subscribes a destination URL to workspace events. Webhooks
are created through API v2 only (`POST https://api.bugsmash.io/api/v2/webhook`, authenticated with an
`X-API-Key` header); there is no dashboard form. Every delivery is signed so you can check it came from BugSmash.

## Common Event Types

These four are the only values the create-webhook docs allow in the `events` array:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `new_comment` | A comment is added | Open a ticket, notify a channel |
| `comment_replied` | A reply is posted on a comment | Sync threads to an issue tracker |
| `status_changed` | A comment's status changes | Close or reopen the linked ticket |
| `comment_updated` | A comment is edited | Refresh the copy in your tracker |

## Delivery Format

BugSmash's docs show these request headers on a delivery:

```
content-type: application/json
x-bugsmash-signature: <HMAC-SHA256 hex digest>
x-webhook-timestamp: 1777121034
user-agent: GuzzleHttp/7
```

The HTTP method is not named in the docs, and **no delivery body is documented**. The field that
carries the event name is therefore unknown. The examples in this skill read `event`, then `type`, from
the illustrative payload below. It is a placeholder, not BugSmash's schema: send `POST /webhook/test`
and inspect a real delivery before relying on any field.

```json
{
  "event": "new_comment",
  "data": { "comment": "Logo is cut off on mobile" }
}
```

## Retries and Idempotency

The docs don't describe BugSmash's retry behaviour and no delivery id header is documented, so
make handlers idempotent on your own key (for example the comment id from the real payload).

## Full Event Reference

See [Create webhook](https://docs.bugsmash.io/api/webhooks/create-webhook) and
[Verify webhook signatures](https://docs.bugsmash.io/api/webhooks/verify-webhook-signatures).
