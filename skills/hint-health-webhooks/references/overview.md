# Hint Health Webhooks Overview

## What Are Hint Health Webhooks?

Hint Health (hint.com) is practice management software for direct primary care. Hint sends an HTTP `POST` with a JSON body to your endpoint when records such as patients, memberships and practitioners are created, updated or deleted. Partners register a global or per-integration webhook endpoint with a partner API key; practices with API Access can register their own.

## Common Event Types

The event name is the top-level `type` field (`resource.action`).

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `patient.created` | A patient is created | Create a matching record in your system |
| `patient.updated` | A patient changes | Sync demographic changes |
| `patient.destroyed` | A patient is deleted | Remove or archive the record |
| `patient.inactive` | A patient becomes inactive | Pause access or billing |
| `membership.created` | A membership is created | Start an entitlement |
| `membership.updated` | A membership changes | Sync plan or status changes |
| `membership.destroyed` | A membership is deleted | End an entitlement |
| `practitioner.created` | A practitioner is created | Add a provider |
| `practitioner.updated` | A practitioner changes | Sync provider details |
| `practitioner.destroyed` | A practitioner is deleted | Remove a provider |

Hint documents 44 event types in total, including `company.created`, `company.updated`, `company.destroyed` and `employee_division.created`. Handle the ones you need and log the rest. Hint holds `.updated` events for a few seconds before sending.

## Event Payload Structure

```json
{
  "id": "evt-jKi2jlalOJk3",
  "created_at": "2015-02-19T10:49:21.419-08:00",
  "type": "patient.created",
  "practice_id": "pra-6BIBTelN3rM5",
  "object": {
    "id": "pat-eN9DgCQ9iQxL",
    "first_name": "Jane",
    "last_name": "Doe"
  }
}
```

| Field | Description |
|-------|-------------|
| `id` | Event id; use it for idempotency |
| `created_at` | When the event was created |
| `type` | `resource.action` event name |
| `practice_id` | The practice the event belongs to |
| `object` | The affected record |

## Delivery Behavior

- At least once: the same event can arrive more than once. Order is not guaranteed.
- 5 second connect timeout, 20 second response timeout.
- Failed deliveries are retried hourly, up to 72 attempts.
- Over 100 failed attempts mutes the integration: at most one delivery per hour, and other events are dropped.

## Full Event Reference

For the complete list of events, see [Hint Health's webhook documentation](https://developers.hint.com/reference/webhooks).
