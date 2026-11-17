# Dial Webhooks Overview

## What Are Dial Webhooks?

Dial gives AI agents real phone numbers: SMS, iMessage, WhatsApp and AI-handled voice
calls. Everything that happens on an account's numbers is published as one stream of
JSON events. A **webhook subscription** delivers that stream to your HTTPS endpoint as
signed POSTs, retried at-least-once. Subscribe with `["*"]` to get every event type
(including ones added later) at one URL, or list the types you want.

Webhooks are the off-machine counterpart to Dial's presence-based event stream
(`dial wait-for` in the CLI, or the `POST /api/v1/events/wait` long-poll): a webhook
needs no open connection, and failed deliveries are retried.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `message.received` | An inbound message arrives: SMS/MMS, iMessage/RCS on an iMessage number, or WhatsApp on a WhatsApp-connected line. Group messages arrive here too, with `groupId` set | Agent replies, OTP capture |
| `message.status_changed` | An outbound message's delivery or read state advances | Delivery confirmation, failure alerts, read receipts |
| `call.status_changed` | A call enters a new lifecycle state: `Queued`, `Ringing`, `In-Progress`, `Terminated` | Live call tracking |
| `call.ended` | A call reaches its terminal status (`completed`, `busy`, `no-answer`, `failed`, `canceled`) | Persist the outcome |
| `call.transcribed` | The call transcript is ready (a thin event, only `callId`) | Fetch the call record for the transcript |
| `number.status_changed` | One of a number's capabilities (`sms`, `imessage`, `call`, `whatsapp`) settles | Wait for a new number to become usable |
| `webhook.ping` | You fire a ping from the dashboard or `POST /api/v1/webhooks/{id}/ping` | Test the endpoint |

`webhook.ping` is never delivered unless you fire it, ignores the subscription's
`eventTypes` filter, and cannot be subscribed to.

## Event Payload Structure

Every delivery body is the same envelope, with event-specific fields in `data`:

```json
{
  "id": "evt_3f9a2b1c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f90",
  "object": "event",
  "type": "message.received",
  "version": 1,
  "createdAt": "2026-05-28T14:32:08.412Z",
  "relatedObject": { "id": "msg_01HW3X7P5QF6K2YQ9YJ7Q8R5N3", "type": "message", "url": null },
  "data": {
    "messageId": "msg_01HW3X7P5QF6K2YQ9YJ7Q8R5N3",
    "from": "+14155550123",
    "to": "+14155559876",
    "channel": "sms",
    "body": "Your verification code is 123456",
    "media": [],
    "replyToId": null,
    "reaction": null,
    "source": "external"
  }
}
```

- `id` is stable per event and equals the `X-Dial-Event-ID` header. **Dedupe on it.**
- `type` equals the `X-Dial-Event-Type` header.
- `version` is **per event type**: `number.status_changed` is at `2`, the rest at `1`.
  Branch on (`type`, `version`), not on `version` alone.
- `relatedObject.url` is the REST path for the resource when one exists (calls and
  numbers), e.g. `/api/v1/calls/<callId>`; `null` for messages and pings.
- All field names are camelCase. Ignore fields you don't recognize.

Useful `data` fields:

- `message.received`: `from`, `to` (`null` on group messages), `groupId`, `channel`
  (`sms`, `imessage`, `rcs`, `whatsapp`), `body`, `media[]`, `replyToId`, `reaction`,
  `source` (`external` for real traffic, `internal` for test injections).
- `message.status_changed`: `changed` (`delivery` or `read`), `deliveryState`
  (`pending`, `delivered`, `undelivered`, `failed`, `unconfirmed`), `readState`
  (`unread`, `read`, `unsupported`), `deliveryError`.
- `call.ended`: `callId`, `direction`, `durationSeconds`, `status`, `canceled`,
  `transcriptAvailable`.
- `call.status_changed`: `status.state`, `previousState`, `terminationType`.
- `number.status_changed` (v2): `status` (`unsettled`, `ready`, `degraded`; `ready` and
  `degraded` are both terminal), `changed[]`, `capabilities`.

## Delivery

- `POST` with `Content-Type: application/json` and headers `X-Dial-Signature`,
  `X-Dial-Event-ID`, `X-Dial-Event-Type`.
- Any **2xx** is success. Non-2xx, connection errors and timeouts (10 s per attempt)
  are retried with exponential backoff, up to **6 attempts** total.
- Delivery is at-least-once: make the handler idempotent on the event `id`.

## Full Event Reference

See the [Dial webhooks guide](https://docs.getdial.ai/documentation/platform/webhooks) and the
[events reference](https://docs.getdial.ai/api-reference/events/overview).
