# Axilio Webhooks Overview

## What Are Axilio Webhooks?

[Axilio](https://axilio.ai) runs real-phone automation: workflow runs, live sessions, files, billing and phone rentals. Webhooks tell your server when something changes in your organization, so you don't poll `GET /runs/{run_id}` until a run finishes. You register a destination once, and Axilio sends it a signed `POST` with a JSON body for each event you subscribed to.

Deliveries follow the [Standard Webhooks](https://www.standardwebhooks.com/) scheme. See [verification.md](verification.md).

## Common Event Types

The documented list has 28 event types and may not be exhaustive. Handle unknown types by acknowledging them with a `2xx`.

### Runs

| Event | Fires when |
|-------|------------|
| `run.started` | A queued run gets a phone and starts executing |
| `run.completed` | A run finishes successfully |
| `run.failed` | A run fails while executing, or Axilio could not queue or dispatch it |
| `run.cancelled` | A run stops before it finishes. `data.reason` is `user` or `queue_timeout` |

### Sessions

| Event | Fires when |
|-------|------------|
| `session.started` | A session gets a phone and goes live |
| `session.ended` | A session ends and Axilio releases its phone. `data.end_reason` is `released`, `idle_timeout`, `max_duration`, `run_finished` or `device_lost` |
| `session.recording_ready` | The session's recording finishes uploading and you can download it |

### Billing

| Event | Fires when |
|-------|------------|
| `balance.low` | Your balance drops below the low-balance alert threshold you set |
| `balance.depleted` | Your balance goes below zero |
| `balance.recovered` | A balance alert ends because the balance rose back above its threshold |
| `invoice.paid` | You pay a subscription or rental invoice |
| `invoice.payment_failed` | A payment attempt on a subscription or rental invoice fails. Each attempt is its own event |
| `subscription.updated` | Your plan subscription changes status, for example to `past_due` or back to `active` |
| `subscription.canceled` | Your plan subscription ends |
| `auto_recharge.succeeded` | Axilio charges an automatic top-up and credits your balance |
| `auto_recharge.failed` | An automatic top-up fails. Axilio turns auto-recharge off until you turn it back on |

Amounts are in microdollars (1,000,000 = $1.00).

### Files

| Event | Fires when |
|-------|------------|
| `file.ready` | An upload completes, or a file a phone captured during a session lands in your library |
| `file.capture_failed` | A file a phone captured never became a library file. `data.reason` says why |
| `file.delivered` | A file you pushed to a phone arrived on it |
| `file.delivery_failed` | A file you pushed to a phone did not arrive. `data.error` says why |

### Phones (rented phones only)

Axilio sends these only for phones your organization rents. Shared phones never send them.

| Event | Fires when |
|-------|------------|
| `phone.maintenance_started` | The phone leaves service for an automatic repair or a software update |
| `phone.maintenance_ended` | The repair or update finished and the phone is back |
| `phone.offline` | The phone leaves service until it proves healthy again or an operator repairs it |
| `phone.online` | A phone that was out of service is back |
| `phone.rental.activated` | A rental starts and the phone becomes yours alone |
| `phone.rental.past_due` | A rental payment fails. The phone stays yours while Stripe retries |
| `phone.rental.canceled` | A rental subscription ends |

### Test

| Event | Fires when |
|-------|------------|
| `webhook.test` | The default type for a test event sent through the API |

## Event Payload Structure

Every delivery is a `POST` with a JSON body of the same shape:

```json
{
  "id": "run.completed:0199a3c2-58c1-7f3a-9f2e-2f9a6a2f6a11",
  "type": "run.completed",
  "occurred_at": "2026-09-24T12:00:45Z",
  "test": false,
  "data": {
    "id": "0199a3c2-58c1-7f3a-9f2e-2f9a6a2f6a11",
    "workflow_id": "0199a3c2-58c1-7f3a-9f2e-2f9a6a2f6a22",
    "status": "completed",
    "trigger": "api",
    "started_at": "2026-09-24T12:00:00Z",
    "completed_at": "2026-09-24T12:00:45Z",
    "success": true,
    "created_at": "2026-09-24T11:59:57Z"
  }
}
```

- `id`: unique per event, and the same value as the `webhook-id` header. It is `<type>:<resource id>[:<time>]`, so a repeatable event such as `phone.offline` carries the time of the change. Use it to discard duplicates.
- `type`: the event type you subscribed to.
- `occurred_at`: when the change happened, in UTC.
- `test`: `true` only for a test you sent yourself.
- `data`: the resource the event is about, with the same field names as the API. It carries ids, statuses, reasons and timestamps only. Payloads never contain your content (run variables or outputs, file bytes, recordings, download links), so fetch those through the API with your own key.

## Delivery Behaviour

- **At least once.** Any non-2xx response, or none, is retried after 30 seconds, 2 minutes, 5 minutes, 15 minutes and 1 hour. Respond with a `2xx` as soon as you have the event and do slow work afterwards. The docs state no timeout.
- **Duplicates are possible.** Keep the `id` of events you have handled and skip repeats.
- **Order is not guaranteed.** `run.completed` can arrive before `run.started`. Compare `occurred_at`, or fetch the resource, instead of relying on arrival order.
- **Failed deliveries stay replayable.** The dashboard's delivery log shows every attempt and its response. Replay a failed event once your endpoint is fixed.

## Full Event Reference

For every event's `data` fields and example payloads, see Axilio's [webhook event reference](https://docs.axilio.ai/webhooks/events) and the [webhooks overview](https://docs.axilio.ai/webhooks/overview).
