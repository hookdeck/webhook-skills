# OpenClaw Webhooks Overview

## What Is OpenClaw?

[OpenClaw](https://openclaw.ai) is an autonomous AI agent platform. Each agent runs inside a Gateway process that manages conversations, tool execution, and external integrations. Webhooks go both ways:

- **Automation webhooks (outbound)**: when an automation (cron job) finishes, the Gateway POSTs the result to a URL you set. This is what this skill's examples receive, and what Hookdeck's OpenClaw source verifies.
- **Inbound hooks**: the Gateway exposes `/hooks/*` endpoints so external services can trigger agent actions without polling.

## Automation Webhooks: Receiving from OpenClaw

Automations are OpenClaw's built-in scheduler. Each job has a delivery mode ([Delivery modes](https://docs.openclaw.ai/automation/cron-jobs/delivery)):

| Mode | What happens |
|------|--------------|
| `announce` | Send the result to a chat channel |
| `webhook` | POST finished event payload to a URL |
| `none` | No automatic result or notification |

Set webhook mode with `openclaw automations create ... --webhook <url>` or `openclaw automations edit <jobId> --webhook <url>`. Webhook delivery can't be combined with chat delivery flags.

### Sequence

1. A job runs on its schedule (`cron`, `every`, or a one-shot `at`)
2. When the run finishes, the Gateway POSTs the finished event as JSON, with `Authorization: Bearer <cron.webhookToken>`
3. Your endpoint verifies the header, handles the event, and returns 2xx
4. OpenClaw records the delivery as **Delivered**, **Not delivered** (HTTP rejection) or **Unknown** (response lost or timed out; not retried)

A successful run with an empty summary skips the POST. Failed runs always send. (The docs state the empty-summary skip; the "failed runs always send" rule is [this condition](https://github.com/openclaw/openclaw/blob/5dc91d677c85706878087ccd6e003dbddc75fe45/src/gateway/server-cron-notifications.ts#L579) in the source.)

### Finished Event

> **Source, not docs.** OpenClaw's docs only say "POST finished event payload to a URL" and don't list its fields. The fields below come from OpenClaw's source at commit `5dc91d6`: the [`CronEvent` type](https://github.com/openclaw/openclaw/blob/5dc91d677c85706878087ccd6e003dbddc75fe45/src/cron/service/state.ts#L53-L76) (`src/cron/service/state.ts`), [`buildCronFinishedWebhookPayload`](https://github.com/openclaw/openclaw/blob/5dc91d677c85706878087ccd6e003dbddc75fe45/src/gateway/server-cron-notifications.ts#L226-L244), which drops `summary` and `diagnostics` on error events, and the [POST with `Authorization: Bearer`](https://github.com/openclaw/openclaw/blob/5dc91d677c85706878087ccd6e003dbddc75fe45/src/gateway/server-cron-notifications.ts#L279-L287) (both in `src/gateway/server-cron-notifications.ts`). Field names can change between releases, so read them defensively.

```json
{
  "jobId": "job_123",
  "action": "finished",
  "runId": "run_abc",
  "runAtMs": 1767268800000,
  "durationMs": 4200,
  "status": "ok",
  "completionStatus": "succeeded",
  "summary": "Three deploys today, all green.",
  "job": { "id": "job_123", "name": "Deploy digest" },
  "nextRunAtMs": 1767355200000
}
```

On a failed run, `status` is `error`, `completionStatus` is `failed`, `error` holds the message, and `summary` is omitted. Use `runId` (or `jobId` + `runAtMs`) as an idempotency key.

### Failure Alerts

A job's `delivery.failureDestination` can also use webhook mode. Alerts go there with the same `Authorization` header and this body:

> **Source, not docs.** The failure-alert body isn't in OpenClaw's docs. It comes from the [failure-alert webhook call](https://github.com/openclaw/openclaw/blob/5dc91d677c85706878087ccd6e003dbddc75fe45/src/gateway/server-cron-notifications.ts#L463-L468) in `src/gateway/server-cron-notifications.ts` at commit `5dc91d6`.

```json
{
  "jobId": "job_123",
  "jobName": "Deploy digest",
  "message": "Automation \"Deploy digest\" failed 2 times in a row.",
  "runAtMs": 1767268800000
}
```

### Outbound Safety

Every automation webhook uses a strict SSRF guard. Public URLs work as-is. A local or private receiver needs an exact `cron.webhookSsrfPolicy.allowedHostnames` entry.

## Inbound Hooks: Calling OpenClaw

The other direction: external services send events to the Gateway's `/hooks/*` endpoints.

### How Inbound Hooks Work

The Gateway receives the webhook, verifies the token, and starts an isolated agent turn. The agent processes the message, and a summary is posted back into the main conversation session.

Sequence:

1. External service sends `POST /hooks/agent` with token and JSON payload
2. Gateway verifies token, responds `202 Accepted`
3. Gateway enqueues an isolated agent turn
4. Agent processes the message in its own session
5. Summary is posted to the main session

### Webhook Endpoints

#### `/hooks/agent` - Trigger Agent Turn

Sends a message that runs as an isolated agent turn with its own session key. The Gateway responds `202 Accepted` immediately. Results are posted to the agent's main session as a summary.

Use cases:
- Notify an agent about external events (new email, deploy status, CI result)
- Trigger automated workflows (scheduled tasks, cron-driven actions)
- Inter-agent communication across platforms

#### `/hooks/wake` - System Wake Event

Enqueues a system-level event that triggers a heartbeat. The Gateway responds `200 OK`. Unlike `/hooks/agent`, this does not start an isolated session - it injects text into the next heartbeat cycle.

Use cases:
- Wake an idle agent
- Signal time-sensitive events
- Lightweight pings that don't need a full agent turn

#### `/hooks/<name>` - Mapped Hooks

Custom hook names resolved via `hooks.mappings` in the Gateway config. Mappings can transform arbitrary payloads into `wake` or `agent` actions with templates or code transforms.

Use cases:
- Gmail Pub/Sub integration
- Custom payload transformations
- Provider-specific webhook ingestion

### Event Payload Structure

#### Agent Hook

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

#### Wake Hook

```json
{
  "text": "Scheduled daily report",
  "mode": "now"
}
```

Only `text` is required. `mode` defaults to `now`.

### Security Model

- **Token-based auth**: Every request must include `hooks.token` via `Authorization: Bearer <token>` or `x-openclaw-token: <token>`.
- **No query-string tokens**: `?token=...` is rejected with `400`.
- **Rate limiting**: Repeated auth failures from the same IP are rate-limited (`429` with `Retry-After`).
- **Payload safety**: Hook payloads are treated as untrusted by default and wrapped with safety boundaries.
- **Session key restrictions**: `sessionKey` in payloads is disabled by default (`hooks.allowRequestSessionKey=false`).
- **Agent ID restrictions**: `agentId` routing can be restricted via `hooks.allowedAgentIds`.

## Full Documentation

- [Manage automations](https://docs.openclaw.ai/automation/cron-jobs/managing-jobs)
- [Delivery modes](https://docs.openclaw.ai/automation/cron-jobs/delivery)
- [Inbound webhooks](https://docs.openclaw.ai/automation/cron-jobs/webhooks)

Payload fields (from source, commit `5dc91d6`, not documented):

- [`CronEvent` type, src/cron/service/state.ts](https://github.com/openclaw/openclaw/blob/5dc91d677c85706878087ccd6e003dbddc75fe45/src/cron/service/state.ts#L53-L76)
- [Finished-event webhook payload, src/gateway/server-cron-notifications.ts](https://github.com/openclaw/openclaw/blob/5dc91d677c85706878087ccd6e003dbddc75fe45/src/gateway/server-cron-notifications.ts#L226-L244)
- [Webhook POST and Authorization header, src/gateway/server-cron-notifications.ts](https://github.com/openclaw/openclaw/blob/5dc91d677c85706878087ccd6e003dbddc75fe45/src/gateway/server-cron-notifications.ts#L279-L287)
- [Failure-alert webhook body, src/gateway/server-cron-notifications.ts](https://github.com/openclaw/openclaw/blob/5dc91d677c85706878087ccd6e003dbddc75fe45/src/gateway/server-cron-notifications.ts#L463-L468)
- [OpenClaw Gateway Configuration](https://docs.openclaw.ai)
