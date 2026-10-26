# AgentLine Webhooks Overview

## What Are AgentLine Webhooks?

AgentLine gives AI agents US and Canadian phone numbers for voice and SMS. Each
agent can have **one webhook URL** that receives all of that agent's events as
signed JSON POSTs. For local agents with no public URL, AgentLine recommends its
persistent Agent Relay instead; webhooks suit a public inbound integration.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `call.received` | An inbound call is answered | Log the caller, start a session |
| `call.utterance` | A live caller turn; its `conversation` field uses `user` and `assistant` roles | Live transcripts, reply logic |
| `call.completed` | A call finishes | Persist the call, fetch the transcript |
| `call.owner_task` | The agent hands a task to its owner | Follow-up tasks |
| `call.failed` | A call fails | Alerting, retries |
| `call.busy` | Line busy | Schedule a retry |
| `call.no-answer` | Callee did not answer | Schedule a retry |
| `call.canceled` | A call was canceled | Clean up state |
| `sms.received` | An inbound SMS arrives | Conversation handling |
| `webhook.test` | You call the test endpoint | Verify the pipeline |

Note the spelling: `call.no-answer` uses a hyphen, `call.owner_task` an underscore.

## Event Payload Structure

AgentLine's events API describes each event as
`{ event_id, agent_id, event_type, payload, created_at }`. The webhook guide does
not publish the exact HTTP delivery body, so the example handlers read the event
type from `event_type` and fall back to `type` or `event`. Log a real
`webhook.test` delivery to confirm the envelope for your account. Note that
`GET /v1/calls/{id}/transcript` uses different role names (`human` / `agent`)
than `call.utterance` (`user` / `assistant`).

## Full Event Reference

See the [AgentLine webhooks guide](https://docs.agentline.cloud/guides/webhooks) and [events guide](https://docs.agentline.cloud/guides/events).
