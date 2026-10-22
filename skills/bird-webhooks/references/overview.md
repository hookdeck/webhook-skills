# Bird Webhooks Overview

## What Are Bird Webhooks?

When something happens in a Bird workspace (an email is delivered, a recipient bounces, a WhatsApp message arrives, a consent preference changes), Bird POSTs a signed JSON event to every webhook endpoint subscribed to that event type. Bird follows the [Standard Webhooks](https://www.standardwebhooks.com) specification for headers, signing and payload structure. Each delivery is one event per HTTP POST with `Content-Type: application/json` and no batching.

This covers the current bird.com API. The legacy MessageBird API (`MessageBird-Signature` / `MessageBird-Signature-JWT`) uses a different scheme and is not covered.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `email.delivered` | The receiving mail server accepted the message | Mark an email sent, update message status |
| `email.bounced` | Permanent SMTP failure; a hard bounce suppresses the address | Clean lists, alert on bad addresses |
| `email.complained` | Recipient marked the message as spam | Stop sending, suppress the address |
| `whatsapp.received` | An inbound WhatsApp message arrived | Route to support, trigger a bot or agent |
| `preference.granted` | A consent grant took effect | Sync opt-ins to your CRM |
| `preference.revoked` | An opt-out took effect | Stop messaging on that channel |

Other types in the catalog (always check the [official event catalog](https://bird.com/docs/guides/webhooks#event-catalog) for the current list):

- Email: `email.accepted`, `email.opened`, `email.clicked`, `email.deferred`, `email.rejected`, `email.out_of_band_bounce`, `email.unsubscribed`, `email.list_unsubscribed`, `email.received` (inbound)
- SMS: `sms.accepted` through terminal status, `sms.received`
- WhatsApp: `whatsapp.accepted`, `whatsapp.delivered`, `whatsapp.read`, `whatsapp.failed`, `whatsapp.rejected`, `whatsapp.reacted`, `whatsapp.group.join_request_created`, `whatsapp.group.join_request_revoked`
- Verify: `verify.verification.created`, `verify.verification.verified`, `verify.attempt.sent`, `verify.attempt.delivered`, `verify.attempt.undelivered`
- Voice: `voice_call.initiated`, `voice_call.answered`, `voice_call.ended`
- Realtime: `realtime.channel_occupied`, `realtime.channel_vacated`, `realtime.member_added`, `realtime.member_removed`, `realtime.client_event`
- Preferences: `preference.deleted`

Event names are never renamed and new types are added as products ship, so ignore types your handler doesn't recognise.

## Event Payload Structure

Every body is the Standard Webhooks nested envelope:

```json
{
  "type": "email.delivered",
  "timestamp": "2026-06-10T14:30:00Z",
  "data": {
    "email_id": "em_01krdgeqcxet5s7t44vh8rt9mg",
    "recipient_id": "er_01krdgeqcxet5s7t44vh8rt9mg",
    "workspace_id": "ws_01krdgeqcxet5s7t44vh8rt9mg",
    "recipient": "user@example.com",
    "recipient_role": "to",
    "tags": [{ "name": "category", "value": "welcome" }],
    "metadata": { "order_id": "ord_123" },
    "broadcast_id": null
  }
}
```

- `type`: `resource.action`, grouped by product.
- `timestamp`: when the event **occurred**. Use it to order events.
- `data`: compact, recipient-scoped facts for correlation. It doesn't contain the full resource; fetch it by ID if you need more.
- The event identity is the `webhook-id` **header**, not a body field. The `webhook-timestamp` header is the time of the current delivery attempt and changes on every retry.
- `email.bounced` adds `bounce_type`, `bounce_class`, `bounce_code`, `bounce_description` and `sending_ip`.
- `whatsapp.received` carries `from` (`display_name`, `phone_number`, `username`), `to`, `whatsapp_id`, `workspace_id`, and the message content (`text`, `image`, `interactive_reply`, and so on).
- Preference events carry the full key (`channel`, `handle`, `sender_scope`, `topic_id`) plus `coverage`, `preference_id`, `transition_id` and `contact_id`.

## Delivery, Retries and Replay

- Respond within **15 seconds** with a `2xx`. Any other status (including `3xx`) or a timeout is a failure, and every failure follows the same retry schedule.
- Retries: 5 s, 5 min, 30 min, 2 h, 5 h, 10 h, 10 h after the previous attempt (±20% jitter), so 8 attempts over about 27.5 hours. A `Retry-After` header can lengthen the next wait but never shorten it.
- Every retry carries the same `webhook-id`. Delivery is at-least-once, so dedupe on it.
- Deliveries are **not ordered**: an `email.delivered` can arrive before the `email.accepted` for the same message.
- After the final retry the delivery is permanently failed. `POST /v1/webhooks/{webhook_id}/replay` redelivers failed deliveries (one attempt each, from the last three days of the attempts log). Replays keep the original `webhook-id`.
- An endpoint that fails continuously for about five days is paused automatically.

## Full Event Reference

For the complete list of events and per-event fields, see [Bird's webhook documentation](https://bird.com/docs/guides/webhooks) and the per-product events pages (for example [email events](https://bird.com/docs/guides/email/events)).
