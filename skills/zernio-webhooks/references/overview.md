# Zernio Webhooks Overview

## What Are Zernio Webhooks?

Zernio (formerly Late, getlate.dev) is a social media management API for scheduling, publishing, inbox and analytics across many platforms. Zernio POSTs an event to your webhook endpoint when something happens: a post publishes, a DM arrives, an account disconnects. You can create up to 50 endpoints per user with `POST /v1/webhooks/settings` or in the dashboard, and subscribe each one to the events it handles.

Every delivery is a JSON `POST` with these headers:

```
Content-Type: application/json
User-Agent: Zernio-Webhooks/1.0
X-Zernio-Event: post.published
X-Zernio-Event-Id: 3f0c1c2e-6c4a-4d3e-9b1f-2a7d8e9f0a1b
X-Zernio-Signature: <lowercase hex HMAC-SHA256, only when the endpoint has a secret>
```

`X-Late-Signature` and `X-Late-Event-Id` are legacy aliases with the same values.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `post.scheduled` | A post enters the scheduled state (can fire more than once per post) | Confirm a post was accepted or queued |
| `post.published` | The post published on every target platform | Mark a post as live, store `platforms[].publishedUrl` |
| `post.partial` | Published on some platforms, failed on others | Retry failed targets |
| `post.failed` | The post failed on every target platform | Alert the author, read `errorCategory` |
| `post.platform.published` | One platform target finished publishing | Incremental UI updates |
| `post.platform.failed` | One platform target failed permanently | Per-platform error handling |
| `message.received` | A new inbox message arrived | Route DMs to support or automation |
| `comment.received` | A new comment arrived on a tracked post | Moderation, comment-to-DM flows |
| `account.connected` | An account was connected to a profile (can repeat on reconnect) | Upsert the account by `accountId` |
| `account.disconnected` | A connected account stopped working or was removed | Prompt the user to reconnect |
| `webhook.test` | You call `POST /v1/webhooks/test` | Verify the endpoint (sent regardless of subscriptions, never retried) |

Other families documented by Zernio: more `post.*` (`post.cancelled`, `post.recycled`, `post.tiktok.url_resolved`, `post.platform.deleted`, `post.external.created`, `post.external.updated`, `post.external.deleted`), inbox (`conversation.started`, `message.sent`, `message.edited`, `message.deleted`, `message.delivered`, `message.read`, `message.failed`, `reaction.received`, `review.new`), automations (`contact.tag_added`, `sequence.enrolled`, `workflow.run.completed`), analytics (`analytics.synced`), ads (`lead.received`, `ad.status_changed`), calls (`call.received`, `call.ended`), WhatsApp (`whatsapp.template.status_updated`, `whatsapp.number.activated`), SMS registration, branded calling, `verification.approved`, `verification.failed` and `api.changelog.published`.

## Event Payload Structure

Every payload carries these top-level fields:

| Field | Description |
|-------|-------------|
| `id` | Stable event UUID. The dedupe key; identical on every retry and redelivery. Never a post or account id. |
| `event` | Event name, for example `post.published` |
| `timestamp` | UTC time the event was generated (unchanged on retries) |
| `profiles` | Array of `{ id, externalId }` for events that belong to a profile |
| `test` | `true` only on samples sent by the test endpoint |

Event-specific data sits in a nested object: `post` (with `platforms[]`) for post events, `message` / `comment` plus `account` for inbox events, and `account` for account events.

```json
{
  "id": "3f0c1c2e-6c4a-4d3e-9b1f-2a7d8e9f0a1b",
  "event": "post.published",
  "profiles": [{ "id": "66a1f0c2a4b9d3e8f1a2b3c4", "externalId": "cus_8f3a2" }],
  "post": {
    "id": "665f1b...",
    "content": "Hello world",
    "status": "published",
    "scheduledFor": "2027-01-01T17:00:00Z",
    "platforms": [
      { "platform": "twitter", "status": "published", "accountId": "665e...", "platformPostId": "123", "publishedUrl": "https://x.com/..." }
    ]
  },
  "timestamp": "2027-01-01T17:00:01Z"
}
```

## Full Event Reference

For the complete list and every payload, see [Zernio's webhook documentation](https://docs.zernio.com/webhooks).
