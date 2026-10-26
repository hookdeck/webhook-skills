# iSnap Webhooks Overview

## What Are iSnap Webhooks?

[iSnap](https://isnap.ai) is an iMessage and SMS line API: messages, reactions, typing indicators, lines (BYOD, rented and shared), trials, pre-orders and hosted macOS sessions with bindings. It sends an HTTP POST with one compact UTF-8 JSON event per request to every webhook subscription that matches the event, when a message is received, a send fails, a line goes offline and so on. Deliveries follow the [Standard Webhooks](https://standardwebhooks.com/) specification and are signed with the subscription's `whsec_` secret.

Events are a fast signal, not a complete record: some changes produce no event, and an event can be lost (for example while a subscription is suspended or inactive). Reconcile from the API's resource operations.

## Event Payload Structure

```json
{
  "api_version": "v1",
  "event_id": "evt_Fh50GcqYY37ay4VjUxQ2rR6jN",
  "event_type": "message.received",
  "created_at": "2026-10-08T14:22:57.143Z",
  "trace_id": "174b4a27e4e4938fa67ea87b23a18579",
  "data": {
    "message": { "id": "msg_7Hq3Zd9Kp2Vx6Wn4Tb8Lc5Ym1", "direction": "inbound", "body": "Is the table still free at 8?" },
    "chat_id": "chat_6Rm1Yb5Tq9Hd3Kx7Wc2Ln8Vz4",
    "contact_name": "Dana Whitfield",
    "metadata": null,
    "line_metadata": { "crm_account_id": "acct_4821" }
  }
}
```

| Field | Meaning |
|-------|---------|
| `api_version` | Always `v1` (not the API's version number) |
| `event_id` | `evt_` plus 25 characters. Same on every attempt, replay and subscription, and equal to the `webhook-id` header. The dedupe key |
| `event_type` | The event type, for example `message.received`. This is what handlers switch on. The envelope has no `id` or `type` field |
| `created_at` | When iSnap recorded the event (ISO 8601 UTC), not when the change happened; that time is inside `data` |
| `trace_id` | 32 hex characters. Don't use it to match an event to a request |
| `data` | Fields of the event type. Always holds `metadata` (of the main resource) and `line_metadata` (of the line, when it is yours) |

The unsigned `X-iSnap-Event` header repeats `event_type`, and `X-iSnap-Delivery-Id`, `X-iSnap-Attempt`, `X-iSnap-Webhook-Id` and `X-iSnap-Probe` are informational too. Only `webhook-*` is signed: read the type and `event_id` from the verified body.

Events carry personal data (message text, handles, contact names, attachment file names). Subscribe only to the types you need and keep that data out of logs.

## Common Event Types

iSnap documents 37 event types (the list may not be exhaustive). The examples route all of them.

| Family | Events |
|--------|--------|
| `message` | `message.queued`, `message.scheduled`, `message.sent`, `message.delivered`, `message.read`, `message.failed`, `message.received`, `message.cancelled`, `message.fallback_triggered` |
| `reaction` | `reaction.added`, `reaction.received`, `reaction.removed` |
| `typing_indicator` | `typing_indicator.started`, `typing_indicator.stopped` (never sent for iMessage lines) |
| `line` | `line.connected`, `line.disconnected`, `line.offline`, `line.degraded`, `line.apple_id_flagged`, `line.quota_warning`, `line.quota_exceeded`, `line.capability_changed`, `line.terminated`, `line.variant_changed`, `line.variant_scheduled`, `line.variant_unscheduled` |
| `trial` | `trial.linked`, `trial.dormant`, `trial.reactivated`, `trial.bind_conflict`, `trial.revoked` |
| `pre_order` | `pre_order.fulfilled`, `pre_order.cancelled` |
| `macos_session` | `macos_session.rented`, `macos_session.released` |
| `binding` | `binding.released` |
| `webhook` | `webhook.test` (probe; never sent through an event filter) |

Key events and when they fire:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `message.received` | An inbound message is stored | Inbox, auto-replies, CRM sync |
| `message.delivered` / `message.read` | The device reports delivery, or the recipient reads | Status tracking |
| `message.failed` | The device reports a failed send, or iSnap fails a waiting message | Alerting, retry logic |
| `message.fallback_triggered` | A message went out over SMS or RCS instead of iMessage | Cost and channel tracking |
| `line.offline` | A BYOD line's device has not reported for 5 minutes, or another line's outage reaches 15 minutes | Paging, failover |
| `line.quota_warning` / `line.quota_exceeded` | A send brings a sending limit to 80% / 100% | Throttling |
| `line.apple_id_flagged` | Apple disabled or restricted the line's Apple ID | Incident response |

Not every line kind gets every `line.*` event: `line.degraded` and `line.capability_changed` are BYOD only, `line.variant_*` are rented lines only, and shared lines never get `line.connected`, `line.offline` or `line.apple_id_flagged`.

## Subscription States

| State | Meaning | How it changes |
|-------|---------|----------------|
| Active | Receives events | Default for a new subscription |
| Suspended | Deliveries stopped after 10 deliveries in a row ended `failed`, or the URL was refused | Resumes only when a signed `webhook.test` probe (`X-iSnap-Probe: 1`) gets a `2xx` |
| Inactive | `active` is `false`: you turned it off, or your endpoint returned `410` | `PATCH /v1/webhooks/{id}` with `active: true` |

The API shows `active` only; a suspended subscription still reads `active: true`. Events that occur while a subscription is suspended or inactive are lost for it.

## Full Event Reference

For the complete list and each event's `data` fields, see iSnap's [event catalog](https://docs.isnap.ai/webhooks/event-catalog) and [webhooks overview](https://docs.isnap.ai/webhooks/overview).
