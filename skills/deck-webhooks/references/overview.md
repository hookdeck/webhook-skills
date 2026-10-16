# Deck Webhooks Overview

## What Are Deck Webhooks?

[Deck](https://deck.co) runs computer-use agents that log in to websites for your users. Credentials are stored in Deck Vault, work runs as tasks inside sessions, and workflows chain task runs together. Every state change produces an **event**, and Deck pushes each event independently to every **event destination** subscribed to it.

A `webhook` destination receives each event as an HTTP `POST`, signed with [Standard Webhooks](https://www.standardwebhooks.com/) (`webhook-id`, `webhook-timestamp`, `webhook-signature`). Deck can also deliver to `aws_sqs`, `aws_kinesis`, `aws_s3`, `gcp_pubsub`, `azure_servicebus`, `rabbitmq` and `hookdeck`. Those types authenticate with their own native credentials and aren't covered by the signature scheme in this skill.

Events are retained for **30 days**.

## Event Envelope

Every event shares this envelope:

```json
{
  "id": "evt_a1b2c3d4",
  "object": "event",
  "type": "task_run.completed",
  "data": { "...": "summary of the resource at the time of the event" },
  "created_at": "2025-01-15T09:31:15Z",
  "request_id": "req_a1b2c3d4"
}
```

| Field | Description |
|-------|-------------|
| `id` | Unique event id (`evt_` prefix). Use this as your **dedupe key** |
| `object` | Always `event` |
| `type` | `object.action`. This is the discriminator |
| `data` | Resource summary. Shape depends on the resource (below) |
| `created_at` | When the event occurred (ISO 8601). Use it to **order** events |
| `request_id` | `req_...` of the API call that caused the event. **Only present** when an API call caused it |

Fields with no value yet are delivered as **empty strings**. For example, a task run outside a workflow has `"workflow_id": ""`.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `task_run.interaction_required` | The agent needs input from your user mid-run | Prompt for an MFA code, security answer or account choice. **Time-sensitive** |
| `task_run.completed` | Run finished successfully (`result: "success"`) | Fetch outputs and files, notify the user |
| `task_run.failed` | Run errored (`result: "failure"`) | Alert, retry with a new run |
| `credential.verified` | A run using the credential succeeded | Mark the user's connection healthy |
| `credential.invalid` | The source rejected the credential | Ask the user to re-enter credentials |
| `workflow_run.completed` | All workflow steps finished | Mark the workflow run done |
| `workflow_run.paused` | A step is waiting on external input such as MFA | Surface the pending interaction |
| `storage.created` | A file was stored during a task run | Download or index the captured document |
| `event_destination.activated` | Destination passed verification and is `active` | Confirm setup in your tooling |

## Full Event Catalog

These are all the documented subscribable types (`"events": ["*"]` subscribes to all of them):

| Resource | Events |
|----------|--------|
| Agents | `agent.created`, `agent.updated`, `agent.deleted` |
| Sources | `source.created`, `source.updated`, `source.deleted` |
| Credentials | `credential.created`, `credential.unverified`, `credential.verified`, `credential.invalid`, `credential.deleted` |
| Sessions | `session.queued`, `session.running`, `session.idle`, `session.completing`, `session.completed`, `session.failed` |
| Tasks | `task.created`, `task.updated`, `task.reset`, `task.deleted` |
| Task runs | `task_run.queued`, `task_run.running`, `task_run.completed`, `task_run.failed`, `task_run.canceling`, `task_run.canceled`, `task_run.interaction_required` |
| Workflows | `workflow.created`, `workflow.updated`, `workflow.deleted` |
| Workflow runs | `workflow_run.queued`, `workflow_run.running`, `workflow_run.paused`, `workflow_run.completed`, `workflow_run.failed`, `workflow_run.canceling`, `workflow_run.canceled` |
| Storage | `storage.created`, `storage.deleted` |
| Event destinations | `event_destination.activated`, `event_destination.deactivated` |

There's also **`test.ping`**, with `data: {"ok": true}`. You can't subscribe to it. It's sent only from **Send test ping** in the Console or `POST /v2/event-destinations/{destination_id}/test`, it's delivered once and it's never retried. Return a `2xx`.

Notes:
- `credential.created` fires with status `unverified`. `credential.unverified` fires when a `verified` or `invalid` credential's auth details are updated, which resets it.
- `task.updated` also fires when a task moves to a new status after successful runs (for example `learning` → `test`). `task.reset` puts a task back to `learning` and invalidates its cached plan.
- `workflow_run.*`: every status transition emits exactly once.

## Payload Shapes

### Task run (`task_run.*`)

```json
{
  "id": "trun_a1b2c3d4",
  "object": "task_run",
  "status": "completed",
  "result": "success",
  "task_id": "task_a1b2c3d4",
  "workflow_id": "",
  "credential_id": "cred_a1b2c3d4",
  "session_id": "sess_a1b2c3d4",
  "agent_id": "agt_a1b2c3d4",
  "source_id": "src_a1b2c3d4",
  "runtime_ms": 12453,
  "created_at": "2025-01-15T09:30:00Z",
  "updated_at": "2025-01-15T09:31:15Z"
}
```

- `result` is `""` until the run reaches a final result, then `success` or `failure`.
- `runtime_ms` appears only once the run has finished.
- Runs created by a workflow step also carry `workflow_run_id` and `step` (the step name). Runs created by a trigger carry `trigger_id`. These fields are omitted otherwise.

### Interactions (`task_run.interaction_required`)

The task run payload also includes an `interaction` object:

```json
"interaction": {
  "type": "mfa",
  "message": "Enter the 6-digit code sent to your phone",
  "fields": [{ "name": "code", "type": "string", "label": "Verification code" }]
}
```

- `interaction.type`: `mfa`, `account_selection`, or `security_question`.
- Field `type`: `string`, `select` or `boolean`. `select` fields include `options: [{ "value", "label" }]`. Submit the chosen `value`.
- Build your UI from `fields` rather than hard-coding per type, because sources can introduce new verification methods.
- Answer with `POST /v2/task-runs/{run_id}/interaction` and body `{"input": {"code": "123456"}}`. Put every field in one request.
- The window to respond is **5 minutes**. After that the run fails with `interaction_timeout` and isn't retried, so you'd need to start a new run. Handle this event first, and acknowledge the webhook fast.
- A wrong answer may produce another `interaction_required`. One run can also chain several prompts, such as MFA followed by a security question.

### Credential (`credential.*`)

```json
{
  "id": "cred_a1b2c3d4",
  "object": "credential",
  "status": "verified",
  "external_id": "user-12345",
  "source_id": "src_a1b2c3d4",
  "auth_method": "username_password",
  "created_at": "2025-01-15T09:28:00Z",
  "updated_at": "2025-01-15T09:30:00Z"
}
```

`status` is `unverified`, `verified`, `invalid` or `deleted`. `external_id` is **your** user identifier.

### Workflow run (`workflow_run.*`)

```json
{
  "workflow_run_id": "wrun_a1b2c3d4",
  "workflow_id": "wflo_a1b2c3d4",
  "org_id": "org_a1b2c3d4",
  "status": "completed",
  "result": "success",
  "session_id": "sess_a1b2c3d4",
  "trigger_id": null,
  "created_by": "usr_a1b2c3d4",
  "created_at": "2025-01-15T09:30:00Z",
  "updated_at": "2025-01-15T09:32:13Z"
}
```

These payloads have **no `id` field**: use `workflow_run_id`. `result` is `null` until the run reaches a terminal status, then `success`, `failure` or `unknown`, and it stays `null` for canceled runs. `trigger_id` is `null` for runs created through the API. Step detail isn't included. Fetch `GET /v2/workflow-runs/{workflow_run_id}` or subscribe to the `task_run.*` events each step emits.

### Workflow (`workflow.*`)

`workflow_id` (`wflo_`), `org_id`, `name`, `created_by`, `created_at`, `updated_at`. The payload doesn't include steps. Fetch `GET /v2/workflows/{workflow_id}` for the definition.

### Storage (`storage.*`)

```json
{
  "id": "stor_a1b2c3d4",
  "object": "storage",
  "file_name": "statement-2025-01.pdf",
  "file_type": "application/pdf",
  "file_size": 245678,
  "fetch_date": "2025-01-15T09:31:10Z",
  "task_run_id": "trun_a1b2c3d4",
  "created_at": "2025-01-15T09:31:12Z"
}
```

### Session (`session.*`)

`id` (`sess_`), `object: "session"`, `status`, `created_at`, `updated_at`.

### Event destination (`event_destination.*`)

`id` (`evtd_`), `object: "event_destination"`, `name`, `status` (`active` / `inactive`), `type` (e.g. `webhook`), `created_at`, `updated_at`.

### Agent, source, task

- Agent: `id` (`agt_`), `object: "agent"`, `name`, `description`, `created_at`, `updated_at`.
- Source: `id` (`src_`), `object: "source"`, `name`, `type` (e.g. `website`), `created_at`, `updated_at`.
- Task: `id` (`task_`), `object: "task"`, `name`, `status` (e.g. `learning`, `test`, `live`), `agent_id`, `created_at`, `updated_at`.

## Delivery Behaviour

| Behaviour | Detail |
|-----------|--------|
| Acknowledge | Return a `2xx` within **5 seconds**. Anything else is a failure and gets retried |
| Retries | Up to **10**, exponential backoff, base 2, starting at 30 seconds |
| Auto-disable | **No.** Persistent failures pile up as `failure` deliveries instead |
| Guarantee | **At least once.** Dedupe on event `id` and return `200` for duplicates |
| Ordering | **Not guaranteed.** `task_run.completed` can arrive before `task_run.running`. Compare `created_at` and skip anything stale |

A slow handler can see the same delivery twice: Deck retries after 5 seconds even if your first request is still running. Persist or enqueue the event, return `200`, and do the work asynchronously.

## Full Event Reference

- [Events reference](https://docs.deck.co/events/events-reference)
- [Destinations and deliveries](https://docs.deck.co/events/destinations-and-deliveries)
- [Webhook best practices](https://docs.deck.co/events/webhook-best-practices)
- [Handling interactions](https://docs.deck.co/guides/interactions)
