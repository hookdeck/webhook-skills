# BugSmash Webhooks Overview

## What Are BugSmash Webhooks?

BugSmash (bugsmash.io) is a visual feedback and review tool for websites, images, video and
documents. A BugSmash **workspace webhook** subscribes a destination URL to workspace events. Add one in
the dashboard (Workspace Settings → Integrations → Webhooks) or through API v2 (`POST https://api.bugsmash.io/api/v2/webhook`,
authenticated with an `X-API-Key` header). Every delivery is signed so you can check it came from BugSmash.

## Common Event Types

The create-webhook docs allow four values in the `events` array. The help center lists the same four
trigger events, but names the reply event `new_reply_on_comment`:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `new_comment` | A comment is added in any project | Open a ticket, notify a channel |
| `comment_replied` / `new_reply_on_comment` | A reply is added to a comment thread | Sync threads to an issue tracker |
| `status_changed` | A comment moves between Active and Resolved | Close or reopen the linked ticket |
| `comment_updated` | A property such as priority or assignee changes | Refresh the copy in your tracker |

## Delivery Format

BugSmash's docs show these request headers on a delivery:

```
content-type: application/json
x-bugsmash-signature: <HMAC-SHA256 hex digest>
x-webhook-timestamp: 1777121034
user-agent: GuzzleHttp/7
```

The HTTP method is not named in the docs. BugSmash's help center ([Webhooks (Advanced)](https://helpcenter.bugsmash.io/articles/9149131-webhooks-advanced))
shows one example body per event: a flat JSON object with the event name in `event`, plus `comment_id`,
`comment_number`, project fields (`project_id`, `project_name`, `project_type`, `project_version_id`,
`project_version`) and `updated_at`. `new_comment` adds the comment text, status, priority, author and
assignee; a reply adds `reply_text` and the replier; `status_changed` adds `status`.

The reply example carries `"event": "new_reply_on_comment"`, while the API subscribes to `comment_replied`.
BugSmash doesn't say which value an API-created webhook receives, so the examples handle both. Send
`POST /webhook/test` with `{"event": "comment_replied"}` to see what your webhook gets.

## Retries and Idempotency

The docs don't describe BugSmash's retry behaviour, and neither the headers nor the example bodies
carry an event or delivery ID. `comment_id` is shared by every event about one comment, so make handlers
idempotent: upsert the comment's state and skip an update whose `updated_at` is older than the one stored.

## Full Event Reference

See [Create webhook](https://docs.bugsmash.io/api/webhooks/create-webhook),
[Webhooks (Advanced)](https://helpcenter.bugsmash.io/articles/9149131-webhooks-advanced) and
[Verify webhook signatures](https://docs.bugsmash.io/api/webhooks/verify-webhook-signatures).
