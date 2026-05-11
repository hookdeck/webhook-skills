# Claude Managed Agents Webhooks Overview

## What Are Claude Managed Agents Webhooks?

[Claude Managed Agents (CMA)](https://platform.claude.com/docs/en/managed-agents) are long-running agent sessions that run inside Anthropic's infrastructure. Most real-time interactions stream over the [SSE event stream](https://platform.claude.com/docs/en/managed-agents/events-and-streaming), but webhooks notify your app of major state transitions without holding an HTTP connection open. They are the recommended way to react to session status changes, multiagent thread lifecycle, and vault/credential changes from a server-side process.

## Common Use Cases

- **Resume work when an agent idles** — receive `session.status_idled` when an agent needs a tool approval or new user message, then fetch the session and prompt the user.
- **Detect terminal failures** — react to `session.status_terminated` to alert operators or open a new session.
- **Coordinate multiagent threads** — `session.thread_created`, `session.thread_idled`, and `session.thread_terminated` track each sub-agent kicked off by a coordinator.
- **Audit vault changes** — capture `vault.created`, `vault.archived`, `vault.deleted` and the per-credential variants for security logging.
- **Re-authenticate OAuth credentials** — `vault_credential.refresh_failed` signals an `mcp_oauth` token cannot be refreshed and needs user re-consent.

## All Supported Event Types

### Session events

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `session.status_run_started` | Agent execution kicks off (every transition to `running`) | Show "thinking" UI, start timers |
| `session.status_idled` | Agent is awaiting input (tool approval or new user message) | Notify user, surface the pending approval |
| `session.status_rescheduled` | A transient error occurred; the session is auto-retrying | Log, surface as soft warning |
| `session.status_terminated` | The session hit a terminal error | Alert on-call, open replacement session |
| `session.thread_created` | A new [multiagent](https://platform.claude.com/docs/en/managed-agents/multi-agent) thread opened by the coordinator | Track sub-agent lifecycles |
| `session.thread_idled` | An agent in a multiagent interaction is awaiting input | Route approval requests to the right user |
| `session.thread_terminated` | A multiagent thread was archived | Persist final state, clean up |
| `session.outcome_evaluation_ended` | An [outcome evaluation](https://platform.claude.com/docs/en/managed-agents/define-outcomes) iteration finished | Record metrics, gate downstream work |

### Vault events

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `vault.created` | Vault successfully created | Audit log, sync workspace state |
| `vault.archived` | Vault archived (also emits `vault_credential.archived` per credential) | Audit log, cleanup |
| `vault.deleted` | Vault deleted (also emits `vault_credential.deleted` per credential) | Audit log, cascade external state |
| `vault_credential.created` | Credential created | Audit log, sync workspace state |
| `vault_credential.archived` | Credential archived directly or via vault archival | Audit log |
| `vault_credential.deleted` | Credential deleted directly or via vault deletion | Audit log, cascade external state |
| `vault_credential.refresh_failed` | An `mcp_oauth` credential cannot be refreshed | Trigger re-consent flow |

## Event Payload Structure

Every webhook delivery has the same envelope:

```json
{
  "type": "event",
  "id": "event_01ABC...",
  "created_at": "2026-03-18T14:05:22Z",
  "data": {
    "type": "session.status_idled",
    "id": "sesn_01XYZ...",
    "organization_id": "8a3d2f1e-...",
    "workspace_id": "c7b0e4d9-..."
  }
}
```

Key fields:

- **`type`** (top level): always `"event"` — switch on `data.type` instead.
- **`id`** (top level): unique per event. Two deliveries with the same `id` are the same event (a retry); use it as the idempotency key.
- **`created_at`**: ISO-8601 timestamp of when the object changed. Use this to sort if ordering matters — ordering across types is **not** guaranteed.
- **`data.type`**: the event type (e.g. `session.status_idled`).
- **`data.id`**: the affected resource's ID. **Fetch the full object via `GET`** — payloads carry only the type and id to avoid stale data on retries.

## Fetching the Full Object

```typescript
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();

if (event.data.type === "session.status_idled") {
  const session = await client.beta.sessions.retrieve(event.data.id);
  // session has the full state
}
```

```python
import anthropic
client = anthropic.Anthropic()

if event.data.type == "session.status_idled":
    session = client.beta.sessions.retrieve(event.data.id)
```

## Delivery Behaviour

- **Headers**: every delivery carries `webhook-id`, `webhook-timestamp`, and `webhook-signature` (Standard Webhooks).
- **Ordering is not guaranteed.** `session.status_idled` may arrive before `session.outcome_evaluation_ended` even if the outcome was produced first. Sort by `created_at` if ordering matters.
- **Retries**: Anthropic retries at least once with the same `event.id`. Use it for idempotency.
- **Redirects are not followed.** A `3xx` response is treated as a failure. Update the URL in Console if the endpoint moves.
- **Auto-disable**: an endpoint is automatically disabled after ~20 consecutive failed deliveries (or immediately if the hostname resolves to a private IP, or the endpoint returns a redirect). Re-enable manually in Console after fixing the issue.
- **Response**: return any `2xx` to acknowledge. Anything else (including `3xx`) counts as a failure and triggers retry.

## Full Event Reference

For the canonical event list and payload schema, see [Anthropic's CMA webhook documentation](https://platform.claude.com/docs/en/managed-agents/webhooks).
