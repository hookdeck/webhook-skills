# Hume Webhooks Overview

## What Are Hume EVI Webhooks?

Hume AI (hume.ai) builds emotionally intelligent voice AI. EVI is its speech-to-speech interface. EVI webhooks send structured payloads to a URL you choose, in real time, while EVI **Chat** sessions run, so you can monitor sessions, automate workflows and run tools server-side.

This skill covers EVI (speech-to-speech) webhooks only. They are configured on an **EVI Config**: each `webhooks` entry has a `url` and the `events` it subscribes to.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `chat_started` | A new or resumed Chat session starts | Start a logging session, update a dashboard, push to Zapier |
| `chat_ended` | A Chat session ends | Session analytics, save transcripts, monitor `ERROR` and timeout end reasons |
| `tool_call` | A tool call is made during a Chat | Run tools server-side and answer through the Control Plane API, usage analytics |

## Event Payload Structure

Dispatch on `event_name`. All three events share these fields:

| Field | Meaning |
|-------|---------|
| `event_name` | `chat_started`, `chat_ended` or `tool_call` |
| `chat_group_id` | ID of the Chat Group the Chat belongs to |
| `chat_id` | ID of the Chat session |
| `config_id` | ID of the EVI Config used |
| `caller_number` | Optional. Caller's E.164 number, only for Chats created through the Twilio phone integration |
| `custom_session_id` | Optional. Your session ID, only with a custom language model |

Event-specific fields (timestamps in these fields are Unix **milliseconds**):

| Event | Extra fields |
|-------|--------------|
| `chat_started` | `start_time`, `chat_start_type` (`new_chat_group` or `resumed_chat_group`) |
| `chat_ended` | `end_time`, `duration_seconds`, `end_reason` (e.g. `USER_ENDED`, `USER_TIMEOUT`, `MAX_DURATION_TIMEOUT`, `INACTIVITY_TIMEOUT`, `ERROR`) |
| `tool_call` | `timestamp`, `tool_call_message` (`name`, `parameters` as stringified JSON, `response_required`, `tool_call_id`, `tool_type`: `builtin` or `function`) |

Sample `chat_ended` payload (from Hume's docs):

```json
{
  "event_name": "chat_ended",
  "chat_group_id": "9fc18597-3567-42d5-94d6-935bde84bf2f",
  "chat_id": "470a49f6-1dec-4afe-8b61-035d3b2d63b0",
  "config_id": "1b60e1a0-cc59-424a-8d2c-189d354db3f3",
  "caller_number": null,
  "custom_session_id": null,
  "end_time": 1716244958546,
  "duration_seconds": 180,
  "end_reason": "USER_ENDED"
}
```

## Delivery

- Method: `POST`, JSON body.
- Two headers accompany each request: `X-Hume-AI-Webhook-Signature` and `X-Hume-AI-Webhook-Timestamp` (Unix seconds).
- Hume's webhook docs do not describe retries, timeouts or a delivery ID. Acknowledge quickly, process asynchronously, and build your own idempotency key (for example `chat_id` + `event_name`, plus `tool_call_id` for tool calls).

## Full Event Reference

See [Hume's EVI webhooks documentation](https://dev.hume.ai/docs/speech-to-speech-evi/configuration/webhooks).
