# Truework Webhooks Overview

## What Are Truework Webhooks?

Truework uses webhooks to tell partners asynchronously when a verification (income, employment, assets) completes. Once configured in Developer Settings, Truework makes a `POST` request with a JSON body to your HTTPS endpoint when an event occurs. There are two webhook types: **Order completed** and **Verification state change**.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `order.completed` | All verifications on the order are completed or canceled | Fetch the order's results from the API; recommended for Credentials and Documents (Beta) verification |
| `verification_request.state.change` | A verification request within an order changes state | Granular Smart Outreach updates; react to `action-required` (or cancel the order) |

Truework's recommendations by verification method: Instant needs no webhook, Credentials and Documents use `order.completed`, Smart Outreach uses `verification_request.state.change`.

## Event Payload Structure

```json
{
  "version": "2023-10-30",
  "hook": { "id": 1, "event": "order.completed", "target": "https://example.com/webhooks/truework" },
  "data": { "order_id": "ord_123" }
}
```

`verification_request.state.change` has the same envelope and a richer `data`:

```json
{
  "data": {
    "order_id": "ord_123",
    "verification_request_id": "vr_456",
    "state": "action-required",
    "metadata": {}
  }
}
```

`state` is one of `pending-approval`, `processing`, `action-required`, `completed`, `canceled`, `invalid`. `completed` means new data is available on the order; `canceled` means the verification could not be completed but may hold applicant-provided information or documents.

## Delivery

- Failed webhooks are retried periodically for 48 hours, with an email to the service account for failures.
- A given event can be delivered more than once: make handlers idempotent.
- Up to 10 webhooks per service account; Sandbox and Production are configured separately.

## Full Event Reference

See [Truework's webhook documentation](https://www.truework.com/docs/api-reference/webhooks).
