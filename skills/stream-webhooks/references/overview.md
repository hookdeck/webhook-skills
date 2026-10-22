# Stream Webhooks Overview

## What Are Stream Webhooks?

Stream (getstream.io) can deliver events from Chat, Activity Feeds, Video and Moderation to your server over HTTP webhooks, or to AWS SQS/SNS. You choose specific event types or all events; the selection applies to every endpoint configured for the app. Stream POSTs a JSON body with a `type` field naming the event.

Handler rules from Stream: accept POST with a JSON payload, answer 2xx as fast as possible, be idempotent (retries on network errors, 408, 429 and 5xx carry the same `X-Webhook-Id`; other non-2xx responses are final), and ignore unknown fields and event types rather than failing.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `message.new` | A new message is added | Push notifications, search indexing, moderation |
| `message.updated` | A message is updated | Re-index, audit trail |
| `message.deleted` | A message is deleted | Remove from search, compliance |
| `reaction.new` | A reaction is added to a message | Engagement analytics |
| `channel.created` | A channel is created | Provision resources, welcome flows |
| `user.updated` | A user is updated | Sync profiles to your database |
| `member.added` | A user is added to a channel | Membership sync, onboarding |

## Event Payload Structure

Every event has `type` and usually `created_at`. Chat events carry `cid` (`<channel_type>:<channel_id>`) plus the relevant object:

```json
{
  "type": "message.new",
  "cid": "messaging:general",
  "message": { "id": "8bffc454-...", "text": "hello", "user": { "id": "tommaso" } },
  "user": { "id": "tommaso" },
  "created_at": "2026-05-01T10:12:00.378448Z"
}
```

- `message.*` and `reaction.new`: `message`, `user`, and for reactions `reaction`
- `channel.created`: `channel_id`, `channel_type`, `channel`
- `member.added`: `member` (with `user_id`, `user`)
- `user.updated`: `user`

## Request Headers

| Header | Description |
|--------|-------------|
| `X-Signature` | Hex HMAC-SHA256 of the request body, keyed with the app API secret |
| `X-Webhook-Id` | Unique ID of the call, consistent across retries |
| `X-Webhook-Attempt` | Attempt number starting at 1 |
| `X-Api-Key` | Your app's API key |

## Full Event Reference

See [Stream webhook events](https://getstream.io/chat/docs/node/webhook_events/) and [webhooks overview](https://getstream.io/chat/docs/node/webhooks_overview/).
