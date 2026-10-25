# Factorial Webhooks Overview

## What Are Factorial Webhooks?

Factorial is HR software. Its webhooks send a real-time HTTP `POST` to a URL you control whenever
an event happens in Factorial (an employee is created, a leave request is approved, a shift is
clocked in). There is no dashboard for them: you create **webhook subscriptions** through the API,
each tying one `subscription_type` to one `target_url`.

Webhooks are **not signed**. The only thing to verify is the optional `challenge` you set on the
subscription, which Factorial echoes in the `x-factorial-wh-challenge` header on every delivery.
**Without a challenge, Factorial sends nothing to verify.**

## Common Event Types

The event is a `subscription_type` in `domain/resource/action` form. It is chosen when you create
the subscription and is **not** present in the delivery.

| Subscription type | Triggered When | Common Use Cases |
|-------------------|----------------|------------------|
| `employees/employee/create_with_contract` | An employee is created together with a contract | Start onboarding, provision accounts |
| `employees/employee/update` | An employee record is modified | Sync a directory |
| `employees/employee/terminate` | An employee is marked as terminated | Deprovision access |
| `contracts/contract_version/create` | A contract version is created | Update payroll |
| `timeoff/leave/create` | A leave request is submitted | Notify the approver |
| `timeoff/leave/approve` | A leave request is approved | Update calendars |
| `timeoff/leave/reject` | A leave request is rejected | Notify the employee |
| `attendance/shift/clock_in` | An employee clocks in a shift | Live attendance |
| `ats/application/create` | A job application is created | Notify recruiters |
| `ats/candidate/create` | A candidate is created | Sync an ATS |

This is a subset. The complete list, with the callback payload for each, is in the Webhooks section
of the [Factorial API reference](https://apidoc.factorialhr.com/reference/webhooks).

## Event Payload Structure

The body is the JSON representation of the affected resource, with its fields at the top level.
There is no envelope and no `event` field.

```
POST https://yourapp.com/webhooks/factorial
content-type: application/json
x-factorial-wh-challenge: 2zal4e6d

{ "id": 2, "full_name": "Ana Blanco Perez", "email": "ana@factorial.com", "updated_at": "2026-10-01T10:32:11.000Z", ... }
```

- `id` identifies the **resource**, not the delivery. There is no unique delivery ID.
- `created_at` is when the resource was created; `updated_at` is effectively the event time for updates.
- Payloads can contain personal and financial data (national IDs, bank details). Protect your logs.

### Headers

| Header | Always sent | Description |
|--------|-------------|-------------|
| `x-factorial-wh-challenge` | Only if a `challenge` was set | Echoes the subscription's `challenge` |
| `x-factorial-author-id` | No | ID of the employee or company that triggered the event |
| `x-factorial-author-type` | No | `employee` or `company` |

## Delivery and Retries

- Factorial calls your HTTPS `target_url`; plain HTTP, `localhost` and private addresses don't work.
- A `2xx` acknowledges. Anything else, or a timeout, is a failed delivery.
- Up to 20 attempts within 48 hours. After that the subscription is **disabled** and you get an email; re-enable it with `PUT ... {"enabled": true}`.
- Retries re-send the same body, so make handlers idempotent (upsert on `id`, or dedupe on type + `id` + `updated_at`).

## Full Event Reference

See [Factorial's webhook documentation](https://apidoc.factorialhr.com/docs/webhooks-what) and
[Payloads & Event Types](https://apidoc.factorialhr.com/docs/payloads-event-types).
