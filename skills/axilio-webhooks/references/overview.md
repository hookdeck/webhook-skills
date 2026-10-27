# Axilio Webhooks Overview

## What Are Axilio Webhooks?

[Axilio](https://axilio.ai) automates real phones. Its webhooks send a signed `POST` with a JSON body to your destination when something changes in your organization: a run finishes, a session ends, a payment fails, a file arrives or a rented phone goes offline. Use them instead of polling `GET /runs/{run_id}`.

Payloads never contain your content: no run variables or outputs, no file bytes, no recordings and no download links. Fetch those through the API with your own key.

## Event Payload Structure

```json
{
  "id": "run.completed:0199a3c2-58c1-7f3a-9f2e-2f9a6a2f6a11",
  "type": "run.completed",
  "occurred_at": "2026-09-24T12:00:45Z",
  "test": false,
  "data": { "id": "0199a3c2-58c1-7f3a-9f2e-2f9a6a2f6a11", "workflow_id": "0199a3c2-58c1-7f3a-9f2e-2f9a6a2f6a22", "status": "completed", "success": true }
}
```

| Field | Meaning |
|-------|---------|
| `id` | Unique per change; equals the `webhook-id` header. Format `<type>:<resource id>[:<time>]` |
| `type` | The event type |
| `occurred_at` | When the change happened (UTC) |
| `test` | `true` only for a test sent from the dashboard |
| `data` | The resource, with the same field names as the API. A field with no value yet is left out |

## Common Event Types

The docs list 28 event types (the list may not be exhaustive).

| Event | Triggered When | Notable `data` fields |
|-------|----------------|-----------------------|
| `run.started` | A queued run gets a phone and starts | `id`, `workflow_id`, `phone_id`, `session_id`, `status` |
| `run.completed` | A run finishes successfully | adds `completed_at`, `success` |
| `run.failed` | A run fails, or could not be queued or dispatched | same as completed |
| `run.cancelled` | A run stops early | `reason`: `user` or `queue_timeout` |
| `session.started` | A session gets a phone and goes live | `session_id`, `status`, `source`, `phone_id` |
| `session.ended` | A session ends and the phone is released | `end_reason`: `released`, `idle_timeout`, `max_duration`, `run_finished`, `device_lost` |
| `session.recording_ready` | A session recording finished uploading | `session_id`, `phone_id` |
| `balance.low` | Balance drops below your alert threshold | `alert_id`, `kind`, `threshold_microdollars`, `balance_microdollars`, `balance_display` |
| `balance.depleted` | Balance goes below zero | same as `balance.low` |
| `balance.recovered` | A balance alert ends | same as `balance.low` |
| `invoice.paid` | A subscription or rental invoice is paid | `stripe_invoice_id`, `invoice_number`, `amount_microdollars`, `currency`, `status`, `plan_name` |
| `invoice.payment_failed` | A payment attempt fails (one event per attempt) | same as `invoice.paid` |
| `subscription.updated` | Plan subscription status changes (for example `past_due`) | `subscription_id`, `plan_name`, `billing_cycle`, `status`, `cancel_at_period_end` |
| `subscription.canceled` | Plan subscription ends | same as `subscription.updated` |
| `auto_recharge.succeeded` | An automatic top-up is charged and credited | `stripe_invoice_id`, `amount_microdollars`, `balance_display` |
| `auto_recharge.failed` | An automatic top-up fails; auto-recharge is turned off | same as succeeded |
| `file.ready` | An upload completes or a captured file lands in your library | `id`, `filename`, `mime_type`, `size_bytes`, `source` (`upload` or `capture`) |
| `file.capture_failed` | A captured file never became a library file | adds `reason` |
| `file.delivered` | A file you pushed arrived on the phone | `id`, `file_id`, `phone_id`, `status`, `bytes_transferred` |
| `file.delivery_failed` | A pushed file did not arrive | adds `error` |
| `phone.maintenance_started` / `phone.maintenance_ended` | A rented phone leaves service for repair or update / returns | `phone_id`, `phone_name`, `status`, `reason`, `changed_at` |
| `phone.offline` / `phone.online` | A rented phone leaves service / is back | same as above |
| `phone.rental.activated` | A rental starts | `id`, `plan_name`, `phone_id`, `status`, `payment_status` |
| `phone.rental.past_due` | A rental payment fails | same as activated |
| `phone.rental.canceled` | A rental subscription ends | same as activated |
| `webhook.test` | Only when you send it | `message` |

`phone.*` events are sent only for phones your organization rents. Money amounts are in microdollars (1,000,000 = $1.00).

## How Do I Recognise Duplicates?

Delivery is at least once, so skip an `id` you have already handled. The `id` is built from the event type and resource:

| Events | `id` |
|--------|------|
| `run.*`, `session.started`, `session.ended`, `phone.rental.activated`, `phone.rental.canceled`, `subscription.canceled` | `<type>:<resource id>` |
| `phone.maintenance_*`, `phone.offline`, `phone.online`, `phone.rental.past_due`, `subscription.updated` | `<type>:<resource id>:<time of the change>` |
| `invoice.paid`, `auto_recharge.*` | `<type>:<Stripe invoice id>` |
| `invoice.payment_failed` | `<type>:<Stripe invoice id>:<attempt number>` |
| `balance.*` | `<type>:<alert id>` |

## Delivery and Retries

- Any non-2xx response, or none, is retried after 30 s, 2 min, 5 min, 15 min and 1 h. The docs state no timeout, so respond quickly and process asynchronously.
- Order is not guaranteed. Compare `occurred_at` or fetch the resource.
- The dashboard's delivery log shows every attempt and response. Replay a failed event once your endpoint is fixed.

## Full Event Reference

For the complete list and example payloads, see [Axilio's webhook documentation](https://docs.axilio.ai/webhooks/overview) and [event reference](https://docs.axilio.ai/webhooks/events).
