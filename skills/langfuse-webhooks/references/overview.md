# Langfuse Webhooks Overview

## What Are Langfuse Webhooks?

Langfuse is an open-source LLM engineering platform. Its prompt-management **Automations** watch
for changes to prompts and run an action. One action is a **Webhook Call**: Langfuse sends an HTTP
`POST` with a JSON body to your URL (the other action posts to Slack). Every request carries an
`x-langfuse-signature` header you can verify with the webhook's signing secret.

Delivery: a `2xx` response confirms receipt; otherwise Langfuse may retry with exponential back-off
until it succeeds. No timeout or attempt limit is documented.

## Common Event Types

The event is the body's `action` field. Today `type` is always `"prompt-version"`.

| `action` | Triggered When | Common Use Cases |
|----------|----------------|------------------|
| `created` | A prompt version is created | Sync prompts to a repo, notify a channel, trigger CI evals |
| `updated` | A version's labels or tags change | Redeploy when `production` moves, refresh a prompt cache |
| `deleted` | A prompt version is deleted | Remove cached copies, audit trail |

Notes:

- An `updated` change fires **two** deliveries: one for the version gaining the label/tag and one
  for the version losing it.
- Only `created` appears in Langfuse's documented payload. The lowercase spelling of `updated` and
  `deleted` follows the automation UI (Created / Updated / Deleted); handle unknown actions by
  logging and returning `200`.

## Event Payload Structure

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2024-07-10T10:30:00Z",
  "type": "prompt-version",
  "apiVersion": "v1",
  "action": "created",
  "prompt": {
    "id": "prompt_abc123",
    "name": "movie-critic",
    "version": 3,
    "projectId": "xyz789",
    "labels": ["production", "latest"],
    "prompt": "As a {{criticLevel}} movie critic, rate {{movie}} out of 10.",
    "type": "text",
    "config": { "key": "value" },
    "commitMessage": "Improved critic persona",
    "tags": ["entertainment"],
    "createdAt": "2024-07-10T10:30:00Z",
    "updatedAt": "2024-07-10T10:30:00Z"
  }
}
```

## Full Event Reference

See [Langfuse's webhooks and Slack integrations documentation](https://langfuse.com/docs/prompt-management/features/webhooks-slack-integrations).
