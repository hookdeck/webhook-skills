# Browserbase Webhooks Overview

## What Are Browserbase Webhooks?

Browserbase webhooks send an HTTP `POST` to an endpoint you own as soon as a subscribed event happens, so you don't have to poll the API for status changes. They're most useful for work that finishes on its own schedule, such as a [Browserbase Function](https://docs.browserbase.com/platform/functions/overview) invocation reaching a terminal state.

Typical uses:

- Update a record once a Function invocation completes, without holding a request open while it runs.
- Alert an on-call channel when a Function build fails.
- Start downstream work (send an email, queue a job) as soon as an invocation finishes.

Endpoints belong to a **project**. The API key you use to create a webhook decides which project owns it.

## Which Event Types Does Browserbase Send?

All current events come from Functions. An **invocation** is one run of a Function; a **build** is a publish of your Function code.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `functions.invocations.pending` | Browserbase accepts and queues an invocation | Show "queued" status in your UI |
| `functions.invocations.running` | An invocation starts executing | Track start time, show progress |
| `functions.invocations.completed` | An invocation finishes successfully | Fetch results, update records, trigger downstream work |
| `functions.invocations.failed` | An invocation fails | Alert, retry the invocation, mark the job failed |
| `functions.builds.running` | A build starts | Deployment dashboards |
| `functions.builds.completed` | A build finishes successfully | Announce the deploy, run smoke tests |
| `functions.builds.failed` | A build fails | Alert the team before the next deploy |

An endpoint receives only the types it subscribes to. Browserbase rejects a subscription to a type that doesn't exist, so a typo fails at registration instead of silently delivering nothing. Browserbase may add types over time, so handlers should acknowledge unknown types with a `2xx`.

## What Does the Event Payload Look Like?

Every delivery wraps the event in the same envelope:

```json
{
  "id": "85e6ff2d-91de-468a-867c-e0d9e4587063",
  "type": "functions.invocations.completed",
  "resourceId": "a3f1c2d4-7b90-4e51-9c8a-2f6d1e0b4c73",
  "data": {}
}
```

| Field | Description |
|-------|-------------|
| `id` | Event identifier. Stable across retries of the same event, so use it to dedupe |
| `type` | Event type from the table above |
| `resourceId` | The invocation or build the event concerns |
| `data` | Type-specific payload. Browserbase's docs don't list per-type fields, so read it defensively |

Envelope keys are additive: Browserbase may add keys but won't rename or remove them. Ignore keys you don't recognize. To get full invocation details, call the Functions API with `resourceId` (for example `GET /v1/functions/invocations/{id}`).

Requests also carry the Standard Webhooks headers `webhook-id`, `webhook-timestamp` and `webhook-signature` (see [verification.md](verification.md)).

## How Does Delivery and Retry Work?

- Your endpoint has **15 seconds** to return any `2xx`. Nothing reads the response body, so an empty one is fine.
- Failures: any non-`2xx` status (including a `3xx` redirect), no response within 15 seconds, or a connection that never opens (DNS or TLS error).
- Retries run immediately, then after 5s, 5m, 30m, 2h, 5h, 10h and 10h. The eighth attempt is the last; the message is then marked failed.
- An endpoint that fails continuously for **five days** is disabled and stops receiving deliveries.
- The same event can arrive more than once, including after you processed it but before your response landed. Make handlers idempotent on the envelope `id`.
- Events aren't ordered per resource. A `completed` event can arrive before the `running` event for the same invocation, so branch on `type` and state rather than arrival order.
- Store the event and return `2xx`, then process it. Slow handlers are the most common avoidable source of retries.

The Webhooks tab in [Settings](https://www.browserbase.com/settings) lists every delivery with its event type, message ID, timestamp, payload and attempts.

## Full Event Reference

- [Browserbase webhooks overview](https://docs.browserbase.com/platform/webhooks/overview)
- [Webhooks example](https://docs.browserbase.com/platform/webhooks/example)
- [Webhooks API reference](https://docs.browserbase.com/reference/api/create-a-webhook)
