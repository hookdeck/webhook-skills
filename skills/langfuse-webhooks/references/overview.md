# Langfuse Webhooks Overview

## What Are Langfuse Webhooks?

Langfuse is an open-source LLM engineering platform. Its **Automations** watch for prompt version
changes or alert severity changes and run an action. One action is a **Webhook**: Langfuse sends an
HTTP `POST` with a JSON body to your URL (Slack, PagerDuty and GitHub Actions are the others). Every
request carries an `x-langfuse-signature` header you can verify with the webhook's signing secret.

Delivery: a `2xx` response confirms receipt; otherwise Langfuse retries with exponential back-off,
and 5 consecutive failed deliveries disable the automation's trigger. Langfuse's open-source worker
uses a 10-second timeout and 4 attempts per delivery (self-hosting defaults).

## Common Event Types

Route on the body's `type`: `prompt-version` for prompt automations (then on `action`, below) and
`monitor-alert` for alert automations, whose body has a `payload` with `severity`, `message` and
`permalink` instead of `action`. See the
[Alerts webhook payload](https://langfuse.com/docs/observability/features/alerts#automations-webhook-payload).

| `action` | Triggered When | Common Use Cases |
|----------|----------------|------------------|
| `created` | A prompt version is created | Sync prompts to a repo, notify a channel, trigger CI evals |
| `updated` | A version's labels or tags change | Redeploy when `production` moves, refresh a prompt cache |
| `deleted` | A prompt version is deleted | Remove cached copies, audit trail |

Notes:

- An `updated` change fires **two** deliveries: one for the version gaining the label/tag and one
  for the version losing it.
- Only `created` appears in Langfuse's documented payload. The lowercase `updated` and `deleted`
  values match the enum in Langfuse's open-source code; handle unknown actions by logging and
  returning `200`.

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
