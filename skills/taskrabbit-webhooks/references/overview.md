# Taskrabbit Webhooks Overview

## What Are Taskrabbit Webhooks?

Taskrabbit's Partner API (Delivery and Home Services) sends webhooks so you can
track your projects in real time instead of polling the API. When a subscribed
event occurs, Taskrabbit sends an HTTP `POST` with a JSON body to your endpoint.

Webhooks are **delivered via Svix**. Your endpoint URL and event subscriptions
are configured in the **Svix Partner Dashboard** that Taskrabbit provides during
partner onboarding. Svix handles signing, retries, delivery logs and endpoint
management.

## Common Event Types

These are the events Taskrabbit documents as available for subscription:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `project.completed` | A project's work has been completed by the Tasker | Mark the order fulfilled, trigger invoicing, request a review |
| `project.canceled` | A project has been canceled | Release inventory, refund or re-book, notify the customer |
| `project.rescheduled` | A task in the project is moved to a new start time | Update the customer-facing appointment, notify the customer |

## Event Payload Structure

Payloads are **flat JSON objects**. The event name is in the `event` field;
there is no `type` / `data` envelope.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `event` | string | Yes | Event name, e.g. `project.completed` |
| `project_uuid` | string (UUID) | Yes | The project this event relates to |
| `timestamp` | string (ISO 8601) | Yes | When the event was processed |
| `agreement_external_reference` | string | No | Your own reference ID, if you set one when creating the project |

### `project.completed`

```json
{
  "event": "project.completed",
  "project_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-01-22T10:00:00Z",
  "agreement_external_reference": "REF-12345"
}
```

### `project.canceled`

Adds a required `cancellation_reason`:

| Reason | Meaning |
|--------|---------|
| `order_canceled` | Canceled by the partner or client |
| `delivery_delayed` | Canceled due to a delivery delay |
| `changed_mind` | The client changed their mind |
| `canceled_by_cs` | Canceled by Taskrabbit Customer Support |

```json
{
  "event": "project.canceled",
  "project_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "cancellation_reason": "order_canceled",
  "timestamp": "2025-01-22T10:00:00Z",
  "agreement_external_reference": "REF-12345"
}
```

### `project.rescheduled`

Adds `new_start_time` and `previous_start_time`. `timestamp` is set to the value
of `new_start_time`, so don't treat it as the time the change happened.

```json
{
  "event": "project.rescheduled",
  "project_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "new_start_time": "2025-06-15T09:15:00Z",
  "previous_start_time": "2025-06-15T07:00:00Z",
  "timestamp": "2025-06-15T09:15:00Z",
  "agreement_external_reference": "REF-12345"
}
```

## Retries and Idempotency

If your endpoint returns a non-2xx status or times out, Svix retries with
exponential backoff. You can view attempts and replay messages manually from the
Svix Partner Dashboard. Taskrabbit recommends idempotent handlers. The payload
has no event ID, so deduplicate on the `svix-id` header, which stays the same
when a message is resent.

## Full Event Reference

For the complete list of events, see [Taskrabbit's webhook documentation](https://developer.taskrabbit.com/docs/webhooks-1).
