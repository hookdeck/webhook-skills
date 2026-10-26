# Ultravox Webhooks Overview

## What Are Ultravox Webhooks?

Ultravox (ultravox.ai) is a realtime voice-AI platform. Account webhooks send an HTTP `POST`
to your endpoint when a call changes state. Each delivery is signed with HMAC-SHA256 using the
webhook's secret (see [verification.md](verification.md)).

## Common Event Types

The body carries the event name in its `event` field. Ultravox documents four:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `call.started` | A call has started | Mark the call in progress, start monitoring |
| `call.joined` | A participant has joined the call | Track participant connection |
| `call.ended` | A call has ended | Fetch the transcript and final call details |
| `call.billed` | A call has been billed | Reconcile usage and cost |

## Delivery and Retries

- A `2xx` response confirms receipt; Ultravox recommends `204`.
- Errors (`4xx`/`5xx`) and unavailability are retried 10 times, starting after about 30 seconds
  and doubling each time.
- Duplicates can occur, so make handlers idempotent.
- Each request is a `POST` and carries `X-Ultravox-Webhook-Signature` and
  `X-Ultravox-Webhook-Timestamp` headers.

## Full Event Reference

For payload fields and the complete list, see
[Ultravox's webhook documentation](https://docs.ultravox.ai/webhooks/available-webhooks).
