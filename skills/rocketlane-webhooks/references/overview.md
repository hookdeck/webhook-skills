# Rocketlane Webhooks Overview

## What Are Rocketlane Webhooks?

Rocketlane is a customer onboarding and project delivery platform. A webhook is defined once
under **Settings > Webhooks** (name, HTTPS URL, optional Basic authentication) and then used
by a **Send webhook** action in an automation. When the automation's trigger fires, Rocketlane
sends an HTTP `POST` with a JSON body to your URL.

Webhooks are HTTPS only and **unsigned**. Basic authentication is the only authentication
method Rocketlane supports.

## Common Event Types

These `eventType` values are listed on Rocketlane's Event Payload page.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `TASK_CREATED` | A task is created | Mirror new tasks into another system |
| `TASK_UPDATED` | A task changes; payload includes `changeLog` | Sync status, assignee or due date changes |
| `TASK_DELETED` | A task is deleted | Remove the mirrored task |
| `PROJECT_CREATED` | A project is created | Provision accounts or channels |
| `PROJECT_UPDATED` | A project changes | Sync project fields |
| `PROJECT_ARCHIVED` | A project is archived | Close out related records |
| `PROJECT_DELETED` | A project is deleted | Clean up |
| `PHASE_CREATED` | A phase is created | Sync project structure |
| `PHASE_UPDATED` | A phase changes | Sync project structure |
| `PHASE_DELETED` | A phase is deleted | Sync project structure |

The Event Payload page prints `"eventType": "TASK_UPDATED."` with a stray full stop in its
structure snippet. The sample payloads have no full stop, so compare against the plain strings.

## Event Payload Structure

```json
{
  "eventId": "a3c7825b-9c89-42ac-8859-50e243d0c131",
  "resourceType": "TASK",
  "eventType": "TASK_UPDATED",
  "version": "1.0",
  "data": { "task": { "taskId": 318, "taskName": "Hire Chief Operating Officer" } },
  "changeLog": {
    "changedFields": ["taskName"],
    "from": { "taskName": "Hire operations head" },
    "to": { "taskName": "Hire Chief Operating Officer" }
  },
  "source": {
    "webhook": { "webhookId": 1, "webhookName": "Receive Rocketlane Notification" },
    "actor": { "emailId": "bobo@rocketlane.com", "userId": 1, "firstName": "Bob", "lastName": "Odenkrik" }
  },
  "eventOccurredAt": 1704199907693,
  "eventTriggeredAt": 1704199908692
}
```

| Field | Meaning |
|-------|---------|
| `eventId` | Unique id per event; use it to dedupe and quote it to Rocketlane support |
| `resourceType` | Resource the event is about; the docs list `TASK` as currently supported |
| `eventType` | One of the values above |
| `version` | Payload version (`1.0`) |
| `data.task` | Task details when `resourceType` is `TASK` (same shape as the Task API) |
| `changeLog` | Only on `_UPDATED` events: `changedFields`, `from` and `to` |
| `source.webhook` | Which webhook definition fired |
| `source.actor` | The user responsible for the event |
| `eventOccurredAt`, `eventTriggeredAt` | Epoch milliseconds |

## Delivery

- Only `200 OK` or `204 No Content` count as delivered. Any other status, or no response within 10 seconds, is a failure.
- Order is not guaranteed to be chronological.
- The docs say Rocketlane guarantees exactly one delivery per event.

## Full Event Reference

See [Rocketlane's Event Payload documentation](https://developer.rocketlane.com/docs/event-payload)
and [Webhook Delivery](https://developer.rocketlane.com/docs/webhook-delivery).
