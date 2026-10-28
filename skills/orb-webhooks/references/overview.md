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

## Payload Styles (`standard` vs `expanded`)

Each webhook endpoint has a **payload style** — `standard` or `expanded` — which sets how much of a subscription or invoice its events carry. Every payload names the style it was rendered in, in its `payload_style` field. The signature scheme is identical for both.

| Style | Subscription / invoice events carry |
|-------|-------------------------------------|
| `standard` | The resource as a summary. A subscription arrives as a `SubscriptionSummary` (`id`, `name`, `status`, `start_date`, `end_date`, `created_at`, `metadata`, plus plan and customer as references); an invoice arrives as an `InvoiceSummary` — every invoice field except line items, `subtotal`, discounts, minimums and maximums. |
| `expanded` | The resource in full, as the API returns it. |

Every other event has the same payload in both styles.

New endpoints use `standard`. Endpoints created before payload styles were introduced use `expanded` until changed, and a payload with **no** `payload_style` field at all (from before the field existed) reads as `expanded`.

Two consequences worth handling:

- A style change applies only to events created after it. **Retries of earlier events keep the style they were created with**, so an endpoint can receive both styles for a while after a change — branch on `payload_style` rather than assuming one.
- When a handler needs something a `standard` payload leaves out, fetch the object by its `id` (Fetch subscription / Fetch invoice). A fetched object reflects current state, which may have moved on since the event.

Orb's SDKs expose one parsing method per style — `unwrap()` for expanded and `unwrapStandard()` / `unwrap_standard()` for standard — and they raise an error naming the right method when handed the other style.

## Event Payload Structure

Orb webhook events follow a common envelope:

```json
{
  "id": "o4mmewpfNNTnjfZc",
  "created_at": "2026-10-22T15:42:29+00:00",
  "type": "invoice.issued",
  "payload_style": "standard",
  "invoice": {
    "id": "invoice_01HABCDXXXXX"
  },
  "properties": {
    "automatically_marked_as_paid": false
  }
}
```

Key fields:
- `id` — Unique **event** ID (not the resource's ID). Use this for idempotency keys (Orb delivers at-least-once).
- `type` — The event type, in the form `<resource_name>.<verb>` (e.g., `invoice.issued`).
- `created_at` — ISO 8601 timestamp of when the event was created, to the second.
- `payload_style` — The style this payload was rendered in: `"standard"` or `"expanded"`. See [Payload Styles](#payload-styles-standard-vs-expanded).
- `<resource_name>` — **The serialized resource**, under a key matching the `resource_name` prefix of `type`. A `subscription.created` event carries it under `subscription`, `invoice.issued` under `invoice`, `customer.created` under `customer`. This is where the resource's own `id` lives.
- `properties` — Only the *additional* fields specific to that event, such as `previous_plan_id` on `subscription.plan_changed`. It is an **empty object** for many event types, and it does **not** carry the resource ID.

> **Read resource IDs from the resource key, not from `properties`.** `event.properties.invoice_id` is not a field Orb sends — the ID is at `event.invoice.id`.

## Full Event Reference

For the complete list of events and payload schemas, see [Orb's webhook documentation](https://docs.withorb.com/integrations-and-exports/webhooks).
