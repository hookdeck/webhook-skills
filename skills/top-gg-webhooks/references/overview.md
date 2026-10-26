# Top.gg Webhooks Overview

## What Are Top.gg Webhooks?

[Top.gg](https://top.gg) lists Discord bots and servers. When a user votes for your project, Top.gg sends an HTTP `POST` to the webhook URL you configure in the project's dashboard (**Webhooks**), so you can reward voters without polling the API. Your endpoint must return a `2xx` within 5 seconds.

Top.gg has two webhook systems:

- **v1** — signed with `x-topgg-signature`; the secret (`whs_...`) is generated when you save the URL. Events are `vote.create` and `webhook.test`.
- **v0 (legacy)** — not signed. A shared secret you enter in the bot edit form is sent verbatim in the `Authorization` header. Flat bodies with `type` values `upvote` and `test`.

Only v1 webhooks, whose secret starts with whs_, are supported. Legacy v0 webhooks aren't signed and fail verification.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `vote.create` | A user votes for your project | Reward voters, update leaderboards, log activity |
| `webhook.test` | You send a test from the project's Webhooks page | Verify your endpoint is reachable and the secret works |

## Event Payload Structure

The top-level `type` names the event and the event data is under `data`.

### `vote.create`

```json
{
  "type": "vote.create",
  "data": {
    "id": "808499215864008704",
    "weight": 1,
    "created_at": "2026-02-09T00:47:14.2510149+00:00",
    "expires_at": "2026-02-09T12:47:14.2510149+00:00",
    "project": { "id": "803190510032756736", "type": "bot", "platform": "discord", "platform_id": "160105994217586689" },
    "query": { "key1": "value", "key2": "value2" },
    "user": { "id": "top.gg id", "platform_id": "discord id", "name": "username", "avatar_url": "<avatar url>" }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `data.id` | string | Top.gg vote ID (snowflake); use it to deduplicate |
| `data.weight` | number | `1` normally, `2` during weekend double-vote periods |
| `data.created_at` / `data.expires_at` | string | ISO 8601 times: when the vote was cast and when the user can vote again |
| `data.project.id` / `.type` / `.platform` / `.platform_id` | string | Top.gg project ID, `"bot"` or `"server"`, always `"discord"`, and the Discord client ID or guild ID |
| `data.query` | object | Parsed query parameters from the `/:id/vote` page URL (`/:id/vote?key1=value` sends `{ "key1": "value" }`) |
| `data.user.id` / `.platform_id` / `.name` / `.avatar_url` | string | Top.gg user ID, Discord user ID, username and avatar URL of the voter |

### `webhook.test`

Carries `data.user` (the tester) and `data.project` with the same fields as above, and no vote `id`, `weight` or timestamps.

### Legacy v0 (not supported by verification)

Bot bodies are flat: `{ "bot": "<discord id>", "user": "<discord id>", "type": "upvote" | "test", "isWeekend": false, "query": "" }`.

## Delivery and Retries

| | v1 | v0 (legacy) |
|---|---|---|
| Timeout | 5 seconds | 5 seconds |
| Max retries | 3 | 10 |
| Retry delay | Exponential backoff, 2^N seconds (about 1s, 2s, 4s) | Exponential backoff, 2^N seconds (1s up to about 17 min) |
| Retry triggers | Timeout or 5xx | Timeout or 5xx (4xx are not retried) |

Each request also includes an `x-topgg-trace` header with a trace ID to quote when debugging a delivery with Top.gg support.

## Full Event Reference

For the complete reference, see [Top.gg's webhook event reference](https://docs.top.gg/webhooks/events) and [webhook overview](https://docs.top.gg/webhooks/overview).
