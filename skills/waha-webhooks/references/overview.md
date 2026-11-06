# WAHA Webhooks Overview

## What Are WAHA Webhooks?

[WAHA](https://waha.devlike.pro/) is a self-hosted HTTP API for WhatsApp. It notifies your application about WhatsApp activity by POSTing JSON events to the webhook URLs configured per session (`config.webhooks[]`). Webhooks can also be configured server-wide with `WHATSAPP_HOOK_URL` and `WHATSAPP_HOOK_EVENTS`. Subscribe only to the events you need; `*` subscribes to all events and can generate a lot of traffic.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `message` | Incoming message (text, audio, files) | Chatbots, inbox sync |
| `message.any` | Any message created, including your own | Full conversation mirror |
| `message.ack` | Direct-chat message sent to server/device, read or played | Delivery and read receipts |
| `message.ack.group` | Group participant received, read or played a message | Group receipts (WAHA's code sends these only on this event, although the docs' example shows `message.ack`) |
| `message.reaction` | A message was reacted to | Engagement tracking |
| `session.status` | Session status changes | QR code login flow, health alerts |
| `group.v2.join` | You joined or were added to a group | Group onboarding |
| `presence.update` | Chat presence changes | Typing/online indicators |

Other events listed in the docs: `engine.event`, `message.waiting`, `message.edited`, `message.revoked`, `chat.archive`, `group.v2.leave`, `group.v2.participants`, `group.v2.participants.join-request`, `group.v2.participants.tag`, `group.v2.update`, `label.upsert`, `label.deleted`, `label.chat.added`, `label.chat.deleted`, `poll.vote`, `poll.vote.failed`, `event.response`, `event.response.failed`, `call.received`, `call.accepted`, `call.rejected`. Some are engine-specific (WEBJS, WPP, NOWEB, GOWS). `group.join`, `group.leave` and `state.change` are deprecated.

## Event Payload Structure

```json
{
  "id": "evt_1111111111111111111111111111",
  "timestamp": 1741249702485,
  "event": "message",
  "session": "default",
  "metadata": { "user.id": "123" },
  "me": { "id": "71111111111@c.us", "pushName": "~" },
  "payload": { "id": "true_11111111111@c.us_AAAA", "from": "11111111111@c.us", "body": "Hi there!", "hasMedia": false },
  "environment": { "tier": "CORE", "version": "2023.10.12" },
  "engine": "WEBJS"
}
```

- `id` is a lower-case ULID prefixed `evt_`; use it for idempotency.
- `metadata` echoes what you passed when starting the session.
- `payload` is event-specific. `message.ack` has `ack`/`ackName`; `session.status` has `status`; `group.v2.join` has `group`; `presence.update` has `id` and `presences[]`.

## Retries

Configure `retries` per webhook: `policy` (`constant`, `linear`, `exponential` with 20% jitter), `delaySeconds`, `attempts`. The docs don't state defaults; [WAHA's sender](https://github.com/devlikeapro/waha/blob/core/src/modules/waha-webhook/WebhookPlugin.sender.ts) uses `constant`, 2 seconds, 15 retries, on any non-2xx or network error, and drops the event after that. Retried deliveries resend the same event, so handlers must be idempotent.

## Full Event Reference

See [WAHA's events documentation](https://waha.devlike.pro/docs/how-to/events/).
