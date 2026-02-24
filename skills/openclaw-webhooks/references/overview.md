# OpenClaw Webhooks Overview

## What Is OpenClaw?

[OpenClaw](https://openclaw.ai) is an autonomous AI agent platform. Each agent runs inside a Gateway process that manages conversations, tool execution, and external integrations. The Gateway can expose HTTP webhook endpoints so external services can trigger agent actions without polling.

## How Webhooks Work

The Gateway receives the webhook, verifies the token, and starts an isolated agent turn. The agent processes the message, and a summary is posted back into the main conversation session.

Sequence:

1. External service sends `POST /hooks/agent` with token and JSON payload
2. Gateway verifies token, responds `202 Accepted`
3. Gateway enqueues an isolated agent turn
4. Agent processes the message in its own session
5. Summary is posted to the main session

## Webhook Endpoints

### `/hooks/agent` - Trigger Agent Turn

Sends a message that runs as an isolated agent turn with its own session key. The Gateway responds `202 Accepted` immediately. Results are posted to the agent's main session as a summary.

Use cases:
- Notify an agent about external events (new email, deploy status, CI result)
- Trigger automated workflows (scheduled tasks, cron-driven actions)
- Inter-agent communication across platforms

### `/hooks/wake` - System Wake Event

Enqueues a system-level event that triggers a heartbeat. The Gateway responds `200 OK`. Unlike `/hooks/agent`, this does not start an isolated session - it injects text into the next heartbeat cycle.

Use cases:
- Wake an idle agent
- Signal time-sensitive events
- Lightweight pings that don't need a full agent turn

### `/hooks/<name>` - Mapped Hooks

Custom hook names resolved via `hooks.mappings` in the Gateway config. Mappings can transform arbitrary payloads into `wake` or `agent` actions with templates or code transforms.

Use cases:
- Gmail Pub/Sub integration
- Custom payload transformations
- Provider-specific webhook ingestion

## Event Payload Structure

### Agent Hook

```json
{
  "message": "New PR opened: feat/auth-flow",
  "name": "GitHub",
  "agentId": "hooks",
  "sessionKey": "hook:github:pr-42",
  "wakeMode": "now",
  "deliver": true,
  "channel": "slack",
  "to": "#dev-notifications",
  "model": "anthropic/claude-3-5-sonnet",
  "thinking": "low",
  "timeoutSeconds": 120
}
```

Only `message` is required. All other fields are optional with sensible defaults.

### Wake Hook

```json
{
  "text": "Scheduled daily report",
  "mode": "now"
}
```

Only `text` is required. `mode` defaults to `now`.

## Security Model

- **Token-based auth**: Every request must include the shared secret via `Authorization: Bearer <token>` or `x-openclaw-token: <token>`.
- **No query-string tokens**: `?token=...` is rejected with `400`.
- **Rate limiting**: Repeated auth failures from the same IP are rate-limited (`429` with `Retry-After`).
- **Payload safety**: Hook payloads are treated as untrusted by default and wrapped with safety boundaries.
- **Session key restrictions**: `sessionKey` in payloads is disabled by default (`hooks.allowRequestSessionKey=false`).
- **Agent ID restrictions**: `agentId` routing can be restricted via `hooks.allowedAgentIds`.

## Full Documentation

- [OpenClaw Webhook Documentation](https://docs.openclaw.ai/automation/webhook)
- [OpenClaw Gateway Configuration](https://docs.openclaw.ai)
