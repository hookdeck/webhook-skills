# Typefully Webhooks Overview

## What Are Typefully Webhooks?

Typefully (typefully.com) is a tool for writing and scheduling social posts. Its API v2 can send an HTTP `POST` to your endpoint when a draft changes state, so you can sync drafts to a CMS, notify a team, or trigger follow-up work when a post goes live.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `draft.created` | A new draft is created in a social set you have access to | Index new drafts, notify reviewers |
| `draft.planned` | A draft becomes planned: dated on the queue and calendar but inert until confirmed into a real schedule | Calendar sync |
| `draft.scheduled` | A draft is scheduled for publishing | Reminders, approval trails |
| `draft.published` | A draft is successfully published | Record published URLs, trigger analytics |
| `draft.status_changed` | Any status transition (includes planned, scheduled, published) | Generic status mirroring |
| `draft.tags_changed` | A draft's tags are modified | Re-categorize in other tools |
| `draft.deleted` | A draft is deleted | Remove from downstream systems |

You can subscribe to any combination of these.

## Event Payload Structure

Every delivery is JSON with two fields:

```json
{
  "event": "draft.published",
  "data": {
    "id": 12345,
    "social_set_id": 67890,
    "status": "published",
    "publish_state": null,
    "created_at": "2025-01-15T10:30:00Z",
    "updated_at": "2025-01-16T09:15:00Z",
    "scheduled_date": "2025-01-20T14:00:00Z",
    "published_at": "2025-01-20T14:00:05Z",
    "draft_title": "Weekly Newsletter",
    "tags": ["marketing", "product"],
    "preview": "Excited to announce our new feature!",
    "platforms": { "x": { "enabled": true, "posts": [{ "text": "..." }] } },
    "x_published_url": "https://x.com/username/status/1234567890"
  }
}
```

`data` is the full draft (the `DraftDetailResponse` schema) at the time of the event, trimmed above. It includes per-platform content for X, LinkedIn, Mastodon, Threads, Bluesky and Substack, and `<platform>_published_url` / `<platform>_post_published_at` fields once published.

## Request Headers

| Header | Description |
|--------|-------------|
| `X-Typefully-Event` | The event type, for example `draft.published` |
| `X-Typefully-Timestamp` | Unix timestamp (seconds) when the event was generated |
| `X-Typefully-Signature` | `sha256=<hex>` HMAC-SHA256 signature |

## Delivery and Retries

- Any `2xx` response acknowledges the event; a non-2xx response is retried.
- Retries use exponential backoff, up to 4 retries (5 attempts in total) over about 1 hour.
- A webhook is **disabled after 100 consecutive failures**. Typefully emails you, and you re-enable it from your API settings once the endpoint is fixed.
- Retries are possible, so make handlers idempotent (see webhook-handler-patterns).

## Full Event Reference

For the complete schemas, see [Typefully's API documentation](https://typefully.com/docs/api) (Webhooks section).
