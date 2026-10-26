# Hail Webhooks Overview

## What Are Hail Webhooks?

Hail (hail.so) is an email, SMS and voice API. When a subscribed event occurs (inbound mail or SMS, a delivery report, a call outcome), Hail POSTs a signed JSON event to your subscription's `target_url`. Return any 2xx to acknowledge. A non-2xx response or a timeout is retried on a fixed ladder.

## Common Event Types

The event type is in the body's `type` field (also in the `X-Hail-Event` header). The public catalog is `GET https://api.hail.so/v1/webhooks/event-types` (no API key).

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `email.received` | A message arrived and Hail accepted it | Inbound email agents, ticketing |
| `email.received.suppressed` | A message arrived but fan-out/forwarding was held back (`data.reason`: `forward_loop`, `forward_rate_limit`, `inbound_rate_limit`, `insufficient_funds`) | Alerting on dropped mail |
| `email.delivered` | SES accepted the message for delivery | Delivery tracking |
| `email.delivery_delayed` | SES reports a transient delay | Monitoring |
| `email.bounced` | The recipient server rejected the message (`data.detail.hard` flags hard bounces) | List hygiene |
| `email.complained` | The recipient marked the message as spam | Suppression lists |
| `email.opened` | The recipient opened the message (HTML emails only) | Engagement analytics |
| `email.clicked` | The recipient clicked a tracked link (HTML emails only) | Engagement analytics |
| `email.send_failed` | An outbound email failed to send | Retry or alert |
| `sms.received` | An inbound SMS arrived | SMS agents |
| `sms.delivered` | The carrier confirmed delivery | Delivery tracking |
| `sms.undelivered` | The carrier reported non-delivery | Fallback logic |
| `sms.failed` | The send failed (transport error or carrier rejection) | Retry or alert |
| `call.received` | An inbound call reached one of your numbers (before the answer) | Call routing |
| `call.answered` | The other side is on the line | Call tracking |
| `call.completed` | The call ended normally | Call logs, billing |
| `call.failed` | The call failed or Hail refused an inbound call | Alerting |
| `call.busy` | The callee was busy or rejected the call | Retry logic |
| `call.no_answer` | The callee did not answer | Retry logic |
| `call.transferred` | The agent handed the live call to a person | Handoff tracking |

## Event Payload Structure

```json
{
  "id": "9f2c…",
  "type": "email.received",
  "api_version": "2026-06-06",
  "created_at": "2026-06-14T12:00:00+00:00",
  "organization_id": "org-uuid",
  "data": { "id": "em-uuid", "direction": "inbound", "from_address": "sender@example.com", "subject": "Re: invoice" }
}
```

`data` depends on the event type: email events carry `from_address`, `to_addresses`, `subject` (inbound adds verdicts, `raw_url`, `attachments`); delivery events add `kind`, `occurred_at` and a `detail` object; SMS events carry `from`, `to`, `body`; `call.*` events carry `id`, `status`, `direction`, `from`, `to`, `agent_id`, `end_reason`.

## Headers

| Header | Meaning |
|--------|---------|
| `X-Hail-Signature` | `t=<unix>,v1=<hex>` signature |
| `X-Hail-Event` | Event type, for example `email.received` |
| `X-Hail-Delivery` | Unique delivery id, stable across retries (use to dedupe) |
| `X-Hail-Subscription` | The subscription that produced the delivery |
| `X-Hail-Email-Domain` | Source email domain for inbound email events (omitted for SMS) |

## Retries

`0s → 30s → 2m → 10m → 1h → 6h → 24h`. After the 7th failed attempt the delivery is marked dead; 50 consecutive dead deliveries auto-disable an org-wide subscription (set its `status` back to `active`).

## Full Event Reference

See [Hail's webhook documentation](https://hail.so/docs/webhooks).
