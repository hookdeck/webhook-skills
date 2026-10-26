# Requesty Webhooks Overview

## What Are Requesty Webhooks?

[Requesty](https://www.requesty.ai) is an LLM routing gateway. It sends two kinds of webhooks on behalf of
your organisation:

- **Spending alerts** ([docs](https://docs.requesty.ai/features/alerts.md)): fired once per threshold
  crossing for users, groups, API keys and the organisation balance. An alert webhook is one of three types:
  JSON (the `{id, type, data}` body this skill handles), Slack, or Teams. The Slack and Teams types are meant
  for those services' incoming-webhook URLs and carry no event name in the body.
- **Sample requests** ([docs](https://docs.requesty.ai/features/sample-requests)): a share of your chat
  completion requests and responses, mirrored to the `webhook_url` you give in the request's
  `requesty.sample` configuration.

Deliveries are signed with [Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks) headers
once your organisation has a signing secret. Before that they are unsigned.

## Common Event Types

7 events are documented, and the list may not be exhaustive. `X-Requesty-Event` carries the name on every
delivery. Alert bodies also have a top-level `type` with the same value. The examples handle all of these:

| Event | Triggered When | Key `data` fields |
|-------|----------------|-------------------|
| `user.budget.exceeded_percent` | A user's monthly spend reaches a percentage of their budget | `user_id`, `user_email`, `limit`, `spend`, `percentage_exceeded`, optional `group_id`, `group_name` |
| `user.budget.exceeded_absolute` | A user's monthly spend reaches a dollar amount | `user_id`, `user_email`, `spend`, `absolute_exceeded`, optional `group_id`, `group_name` |
| `group.budget.exceeded_percent` | A group's combined spend reaches a percentage of its budget | `group_id`, `group_name`, `group_admins[]`, `limit`, `spend`, `percentage_exceeded` |
| `org.balance.below_absolute` | The organisation balance drops below a dollar amount | `org_id`, `balance_threshold`, `current_balance` |
| `apikey.budget.exceeded_percent` | An API key's monthly spend reaches a percentage of its budget | `api_key_id`, `api_key_name`, `limit`, `spend`, `percentage_exceeded` |
| `apikey.budget.exceeded_absolute` | An API key's monthly spend reaches a dollar amount | `api_key_id`, `api_key_name`, `spend`, `absolute_exceeded` |
| `sample.request` | A sampled request and its response are mirrored to your `webhook_url` | `request_id`, `request`, `response` (top level, no `data`) |

All numeric values in alerts are strings, for example `"spend": "82.40"` and `"percentage_exceeded": "0.8"`
(a fraction, so 80%).

## Payload Structure

Alerts:

```json
{
  "id": "3f1c2a6e-9b7d-4e21-8c5a-2d6f0b1e7a90",
  "type": "org.balance.below_absolute",
  "data": { "org_id": "org_abc123", "balance_threshold": "100", "current_balance": "87.50" }
}
```

Sample requests have no `type` or `data`. `request` and `response` follow the OpenAI Chat Completion shapes:

```json
{
  "request_id": "...",
  "request": { "model": "openai/gpt-4o", "messages": [{ "role": "user", "content": "hello" }] },
  "response": { "object": "chat.completion", "choices": [], "usage": { "total_tokens": 25, "cost": 0 } }
}
```

A sample request webhook may answer with a JSON body `{"feedback": {...}}`. Requesty attaches the whole
`feedback` object to the sampled request's log. Keys may contain `a-z A-Z 0-9 - _` (up to 128 chars) and
values must be strings holding a float, an int64, or a string under the same constraints.

## Delivery Behavior

| Property | Value |
|----------|-------|
| Response timeout | 15 seconds per attempt |
| Retries | Up to 3, with exponential backoff |
| `webhook-id` | Same on every retry (alert `id`, or sample `request_id`) |
| Retry signing | Each attempt is signed again: new `webhook-timestamp` and `webhook-signature` |
| Delivery model | At-least-once, so deduplicate on `webhook-id` |
| Challenge | None |

Return `2xx` quickly and process asynchronously. Requesty retries failed deliveries, so make handlers
idempotent.

## Full Event Reference

See Requesty's [Spending Alerts](https://docs.requesty.ai/features/alerts.md),
[Sample Requests](https://docs.requesty.ai/features/sample-requests) and
[Webhook Signatures](https://docs.requesty.ai/features/webhook-signatures) pages.
