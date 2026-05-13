# Orb Webhooks Overview

## What Are Orb Webhooks?

[Orb](https://www.withorb.com/) is a usage-based billing platform. Orb uses webhooks to notify your application when events occur in your account — customer lifecycle changes, subscription state transitions, invoice finalization, payment status updates, and scheduled data export deliveries.

Webhooks are essential for keeping downstream systems (your application database, accounting tools, CRM, alerting) in sync with billing state without polling Orb's API.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `customer.created` | A new customer is created in Orb | Sync to internal CRM, send welcome email |
| `customer.credit_balance_dropped` | A customer's prepaid credit balance falls below a configured threshold | Trigger top-up reminder, alert account manager |
| `customer.accounting_sync_succeeded` | Orb successfully synced a customer to your accounting integration | Mark CRM record as synced |
| `subscription.created` | A new subscription is created | Provision access, kick off onboarding |
| `subscription.started` | A subscription's billing period begins | Activate entitlements |
| `subscription.ended` | A subscription ends | Revoke access, send retention email |
| `subscription.plan_changed` | A subscription moves to a different plan | Update entitlements, recalculate quotas |
| `subscription.edited` | A subscription is edited (price overrides, adjustments) | Reconcile internal records |
| `subscription.usage_exceeded` | Usage crosses a configured threshold | Notify customer, throttle or upsell |
| `invoice.issued` | An invoice is finalized and issued to the customer | Record receivable, send invoice email |
| `invoice.payment_succeeded` | An invoice is paid | Mark paid in internal systems |
| `invoice.payment_failed` | An invoice payment attempt fails | Start dunning, notify customer |
| `invoice.edited` | An invoice is edited after issuance | Re-sync accounting |
| `data_exports.transfer_success` | A scheduled data export was delivered successfully | Trigger downstream ETL |

## Summary Webhooks (Optional)

Orb supports an opt-in **summary webhook** variant that delivers the same event types with smaller payloads:

- `line_items` is omitted from invoice payloads
- The embedded customer and plan objects are minified to identification fields only

When summary webhooks are enabled, consumers should fetch the full resource via the Orb API when more detail is needed. The signature scheme is identical.

## Event Payload Structure

Orb webhook events follow a common envelope:

```json
{
  "id": "evt_01HABCDXXXXX",
  "created_at": "2026-05-13T12:34:56.000Z",
  "type": "invoice.issued",
  "properties": {
    "invoice_id": "invoice_01HABCDXXXXX"
  }
}
```

Key fields:
- `id` — Unique event ID. Use this for idempotency keys (Orb delivers at-least-once).
- `type` — The event type (e.g., `invoice.issued`).
- `created_at` — ISO 8601 timestamp of when the event occurred.
- `properties` — Event-specific payload; typically contains resource IDs you can fetch from the Orb API for full detail.

## Full Event Reference

For the complete list of events and payload schemas, see [Orb's webhook documentation](https://docs.withorb.com/integrations-and-exports/webhooks).
