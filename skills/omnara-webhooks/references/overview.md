# Omnara Webhooks Overview

## What Are Omnara Webhooks?

Omnara hosts AI agents. An agent's `event_webhook` sends its timeline events (inputs, model
outputs, tool results, context checkpoints) and tool-call updates to a public HTTPS endpoint as
`POST` requests with a JSON body. Each agent sends its own events. Self-subagents inherit the
webhook configuration and send events with their own agent IDs; other subagents use their
profile's configuration.

Webhook deliveries are suppressed for deleted projects and organizations, including events
produced by their deletion. No challenge or validation request is documented.

## Common Event Types

`event_webhook.events` is a required, nonempty allowlist of these types (5 documented; the list
may not be exhaustive). The type is the top-level `event` in the body:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `agent_input` | Input is added to an agent's timeline (`input_kind`, `content_blocks`) | Audit trails, mirroring conversations |
| `model_output` | The model produces output (`stop_reason`, `content_blocks`) | Logging responses, cost and quality tracking |
| `tool_result` | A tool call finishes (`tool_call_id`, `outcome`, `content_blocks`) | Monitoring tool outcomes |
| `context_checkpoint` | The context is summarized (`summary`, `summarized_through_event_sequence`) | Tracking context compaction |
| `tool_call_update` | A tool call or interaction changes state (`state`, optional `interaction_update`) | Custom tool execution, approvals |

## Event Payload Structure

```json
{ "event": "tool_result",
  "data": {
    "id": "evt_5n6a2bfgik7mv4qtrwz3jehcyd",
    "org_id": "org_...", "project_id": "proj_...", "agent_id": "agt_...", "turn_id": "trn_...",
    "turn_sequence": 1, "is_opening_event": false, "sequence": 3,
    "event_kind": "tool_result",
    "tool_call_id": "tcl_5n6a2bfgik7mv4qtrwz3jehcyd", "outcome": "succeeded",
    "content_blocks": [{ "type": "text", "text": "Ticket created." }],
    "created_at": "2026-09-18T12:00:00Z" } }
```

- Timeline events (`agent_input`, `model_output`, `tool_result`, `context_checkpoint`) carry
  event, organization, project, agent and turn identifiers, a `sequence`, `event_kind` (repeats
  `event`) and `created_at`, plus type-specific fields.
- `tool_call_update` carries a state snapshot, not the tool arguments or a timeline sequence:

```json
{ "event": "tool_call_update",
  "data": { "tool_call_id": "tcl_...", "agent_id": "agt_...", "state": "awaiting_permission",
            "interaction_update": { "id": "int_...", "interaction_kind": "permission", "state": "open" } } }
```

It is a notification to fetch the tool call or interaction for its current details. For custom
tool execution, handle `ready` updates and deduplicate by tool-call ID. When a permission or
question opens or closes, `interaction_update` carries its ID, kind and state (`open`,
`resolved`, `canceled`). Omission means no interaction change. A terminal update takes
precedence over a late `open` update.

## Delivery Behavior

- Deliveries are queued for up to ten minutes with a five-second request timeout.
- Failures are retried with exponential backoff and jitter within that window. Return `2xx` to acknowledge.
- At-least-once and unordered: deduplicate on `Webhook-Id` (stable across retries) and tool calls by tool-call ID.
- `Webhook-Timestamp` is the Unix time in seconds of each attempt.

## Full Event Reference

See [Omnara's webhook payloads](https://docs.omnara.com/events/webhooks) and the
[agent configuration](https://docs.omnara.com/agents/configuration#event-webhook) docs.
