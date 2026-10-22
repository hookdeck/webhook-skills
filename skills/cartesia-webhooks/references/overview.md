# Cartesia Webhooks Overview

## What Are Cartesia Webhooks?

[Cartesia](https://cartesia.ai) runs voice AI agents built with Line. Agent webhooks push call
lifecycle and conversation events to your HTTPS endpoint. Attaching a webhook (URL + secret) to
an agent turns on delivery for that agent's calls, and one webhook can be attached to several
agents.

Things that differ from signed providers such as Stripe or GitHub:

- **No payload signature.** Cartesia sends the secret you chose, unchanged, in the
  `x-webhook-secret` header. See [verification.md](verification.md).
- **At-least-once delivery.** A delivery is retried up to 3 times on network errors and on
  `403`, `408`, `429` and `5xx` responses. Other `4xx` responses (including `401`) are
  permanent failures. Deduplicate on `webhook_request_id`.
- Your endpoint must accept `POST` with `application/json`.

## Common Event Types

| Event | Triggered When | Typed field | Common Use Cases |
|-------|----------------|-------------|------------------|
| `call_started` | Call session begins | `call` | Open a call record, notify an agent dashboard |
| `call_completed` | Call ends normally | `call` | Store the transcript and `end_reason`, bill usage |
| `call_failed` | Call ends with an error | `call` | Alerting, read `call.error_message` |
| `call_turn` | Each conversational turn | `turn` | Live transcript, real-time monitoring |
| `post_call_analysis` | Async analysis finishes | `analysis` | Attach the call summary |

`post_call_analysis` is not sent when nobody spoke on the call (unanswered or failed to connect).

## Event Payload Structure

Envelope fields on every event:

| Field | Description |
|-------|-------------|
| `type` | Event type (table above) |
| `call_id` | Call identifier |
| `agent_id` | Agent that handled the call |
| `webhook_id` | Webhook config id |
| `webhook_request_id` | Stable across retries of the same event; use to deduplicate |
| `timestamp` | RFC 3339 event time |

`call` (on `call_started`, `call_completed`, `call_failed`) carries `id`, `agent_id`,
`agent_name`, `status` (`started`, `completed`, `failed`), `start_time`, `end_time`,
`end_reason` (e.g. `client_hangup`, `agent_hangup`, `call_inactivity`), `transcript`,
`telephony_params`, `deployment_id`, `error_message` (failed calls), `dynamic_variables` and
`summary`. Some fields, such as `end_time` on `call_started`, may be absent.

`turn` (on `call_turn`) carries `id`, `role` (`assistant` or `user`), `text`,
`start_timestamp`, `end_timestamp`, `was_interrupted`, `stt_ttfb`, `tts_ttfb` and `tool_calls`.

`analysis` (on `post_call_analysis`) carries `summary`.

```json
{
  "type": "call_completed",
  "call_id": "ac_sid_gqkgRWUz2u64qFUjA1mZyr",
  "agent_id": "agent_rwh4HGMgyhK7rM5ucVqbiC",
  "webhook_id": "agent_webhook_P3MgdLf1cpaucZJ7xWehCC",
  "webhook_request_id": "webhook_req_8h2NcVqbiCP3MgdLf1cpa",
  "end_reason": "client_hangup",
  "timestamp": "2026-04-16T01:08:50.061907836Z",
  "call": { "id": "ac_sid_gqkgRWUz2u64qFUjA1mZyr", "status": "completed", "end_reason": "client_hangup", "transcript": [] }
}
```

## Full Event Reference

See [Cartesia's observability documentation](https://docs.cartesia.ai/line/infrastructure/observability#webhooks).
