# Vitable Health Webhooks Overview

## What Are Vitable Health Webhooks?

Vitable Health ([vitablehealth.com](https://vitablehealth.com)) is an embedded health-benefits API for payroll and HR platforms. When something happens in your integration (an enrollment is accepted, an employee becomes eligible, a payroll deduction is generated), Vitable sends an HTTP `POST` with a small JSON event to the endpoint you registered, so you don't have to poll the API.

Events are **thin**: the payload identifies the resource but doesn't contain it. Call the Vitable API with `resource_id` to read the current state.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `enrollment.started` | An enrollment has started (employee opens enrollment) | Track enrollment progress |
| `enrollment.elected` | An employee has elected a benefit | Record the election |
| `enrollment.accepted` | An enrollment has been accepted | Mark coverage as active, update the employee record |
| `enrollment.granted` | An enrollment has been granted | Sync coverage status |
| `enrollment.waived` | An employee has waived a benefit | Record the decline |
| `enrollment.terminated` | An enrollment has been terminated | End coverage in your system |
| `employee.eligibility_granted` | An employee has been granted benefits eligibility (after census sync) | Show enrollment options to the employee |
| `employee.eligibility_terminated` | An employee's benefits eligibility has been terminated | Hide enrollment options |
| `employee.deactivated` | An employee has been deactivated (after termination) | Offboard the employee |
| `employee.deduction_created` | A new payroll deduction has been generated (monthly cycle, 1st of each month) | Feed the deduction into payroll |

## Event Payload Structure

```json
{
  "event_id": "wevt_550e8400-e29b-41d4-a716-446655440000",
  "organization_id": "org_xyz789",
  "event_name": "enrollment.accepted",
  "resource_type": "enrollment",
  "resource_id": "enrl_7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "created_at": "2026-01-23T14:30:00+00:00"
}
```

| Field | Description |
|-------|-------------|
| `event_id` | Prefixed identifier (`wevt_...`). Use it for idempotency |
| `organization_id` | The organization the event belongs to; use it to route events when you manage several employers |
| `event_name` | `{resource}.{action}` |
| `resource_type` | `enrollment`, `employee`, ... |
| `resource_id` | Prefixed ID of the affected resource; fetch its current state from the API |
| `created_at` | ISO 8601 (UTC) |

## Delivery and Retries

- Any `2xx` response acknowledges the delivery.
- Otherwise Vitable retries up to 14 times with exponential backoff and jitter: the first retry after 1 minute, at most 24 hours apart, about 3.4 days in all.
- After 25 consecutive failed deliveries the circuit opens and deliveries stop; ask Vitable to re-enable the endpoint.
- Delivery is **at-least-once**. Deduplicate on `event_id`.
- Events you missed can be queried from the API.

## Full Event Reference

See Vitable's [webhooks](https://developer.vitablehealth.com/webhooks) and [events](https://developer.vitablehealth.com/webhooks/events) documentation.
