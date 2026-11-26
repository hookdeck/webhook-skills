# Courier Webhooks Overview

## What Are Courier Webhooks?

[Courier](https://www.courier.com/) is a notification infrastructure platform for
sending messages across email, SMS, push, chat, and in-app channels. Courier
**outbound webhooks** push real-time events to your endpoint as messages move through
their lifecycle and as audiences change — so you can sync delivery status, trigger
downstream automation, or feed analytics without polling the Courier API.

Every outbound webhook is a `POST` request with a JSON body and a `courier-signature`
header you use to verify the request is genuinely from Courier. The header carries a
millisecond timestamp (`t`), and Courier publishes no replay tolerance: the 5-minute
window in this skill's examples is a chosen default. See
[verification.md](verification.md).

## Event Payload Structure

All events share a consistent envelope with two top-level properties:

```json
{
  "type": "message:updated",
  "data": {
    "...": "event-specific fields"
  }
}
```

- `type` — the event name (colon-delimited, e.g. `message:updated`)
- `data` — an object with the fields relevant to that event

Your handler should switch on `type` and read details from `data`.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `message:updated` | A message's delivery status changes | Sync delivery/open state, analytics |
| `notification:submitted` | A template is submitted for review | Custom approval workflows |
| `notification:submission_canceled` | A pending template submission is canceled | Close the review task |
| `notification:published` | A template is published | Sync template content to a translation system |
| `audiences:created` | An audience is created | Mirror segment definitions |
| `audiences:updated` | An audience's definition changes | Sync segment definitions |
| `audiences:deleted` | An audience is deleted | Remove the mirrored segment |
| `audiences:calculated` | Courier finishes recalculating an audience | Kick off downstream jobs |
| `audiences:user:matched` | A user starts matching an audience's filter | Trigger onboarding, tag users |
| `audiences:user:unmatched` | A user stops matching an audience's filter | Revoke access, update CRM |
| `preferences:user:updated` | A user changes a topic's subscription preference | Sync opt-outs to your own records |

## Important: No Per-Status Message Events

Courier does **not** emit separate events for each delivery status. There is no
`message:delivered`, `message:opened`, or `message:clicked` event. Instead, a single
`message:updated` event fires whenever a message's status changes, and the current
`status` plus relevant timestamps are carried inside `data`. Inspect `data.status`
to react to specific states.

> Courier's events page lists the statuses a `message:updated` event carries:
> `ENQUEUED`, `SENT`, `DELIVERED`, `OPENED`, `CLICKED`, `UNROUTABLE` and
> `UNDELIVERABLE`. One message produces several events that share `data.id`, and
> `OPENED` or `CLICKED` can arrive before `DELIVERED`, or without it. Keep a
> fallback branch for values you do not recognize.

## Environment Scoping

Webhooks are **scoped to the environment where they are created**. A webhook created in
the test environment receives only test events; a webhook created in production receives
only production events. Configure a webhook in each environment you want to monitor.

## Delivery and Response

Return a `2xx` within 10 seconds and defer heavy processing to a background job or
queue. Courier retries network errors, timeouts, `408`, `429` and `5xx` responses, from a
few seconds apart up to 15-minute intervals, for about a day, then drops the event. Any
other `4xx` is not retried. A retry can deliver the same event twice, so make your
handler idempotent, keyed on `data.id` plus `data.status` for `message:updated`.

## Full Event Reference

For the complete list of events and payloads, see
[Courier's webhook event types page](https://www.courier.com/docs/monitor/webhooks/events).
