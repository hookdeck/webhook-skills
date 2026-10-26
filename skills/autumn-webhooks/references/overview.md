# Autumn Webhooks Overview

## What Are Autumn Webhooks?

[Autumn](https://useautumn.com) manages pricing and billing for AI apps and keeps subscription state, usage tracking and access control in sync on its own. Webhooks are for the cases where you want to react in your own systems: send activation emails, start onboarding, update a CRM, sync plan state into your database, or shut off downstream services when a customer cancels. Autumn sends them through [Svix](https://www.svix.com/), so they carry `svix-id`, `svix-timestamp` and `svix-signature` headers.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `billing.updated` | A customer's plans change (new subscription, upgrade, downgrade, cancel, expiry) | Sync plan state, upgrade emails, cancellation handling, trial-end emails |
| `balances.limit_reached` | A customer hits a feature limit | Upsell prompts, block downstream usage |
| `balances.usage_alert_triggered` | A customer crosses a configured usage alert threshold | "80% used" warnings |
| `billing.auto_topup_succeeded` | An auto top-up grants prepaid balance | Receipts, ledger updates |
| `billing.auto_topup_failed` | An auto top-up is blocked, declined or fails | Dunning, notify the customer |
| `invoice.finalized` | A Stripe invoice is finalized and its line items reconciled | Accounting sync, invoice emails |

`customer.products.updated` appears in Autumn's changelog as the earlier name for plan-change events. Current docs list `billing.updated`. Handle both if you've been subscribed a long time.

In the dashboard you can subscribe to all events or a subset. Through the API, leaving `events` out sends every event. `vercel.*` events (Vercel Marketplace) can't be mixed with other events on the same webhook.

## Event Payload Structure

Dispatch on the body's `type`:

```json
{
  "type": "billing.updated",
  "data": {
    "object": "billing.updated",
    "customer_id": "user_123",
    "entity_id": "team_456",
    "plan_changes": [
      {
        "action": "activated",
        "subscription": { "plan_id": "pro", "status": "active", "past_due": false, "started_at": 1761840000000,
                          "canceled_at": null, "expires_at": null, "trial_ends_at": null,
                          "current_period_start": 1761840000000, "current_period_end": 1764432000000 },
        "previous_attributes": null,
        "item_changes": []
      }
    ],
    "tags": []
  }
}
```

- `plan_changes[].action` is one of `activated`, `scheduled`, `updated`, `expired`. A one-off product carries `purchase` instead of `subscription`.
- `previous_attributes` holds the old values of fields that changed. `previous_attributes.canceled_at === null` means a cancellation was just set; a number means an un-cancel.
- `tags` may include `trial_ended` or `phase_changed`.
- `entity_id` is present for entity-scoped events.
- All timestamps in payloads are milliseconds since the Unix epoch.

```json
{ "type": "balances.limit_reached",
  "data": { "customer_id": "user_123", "feature_id": "api_calls", "limit_type": "included" } }
```

`limit_type` is `included`, `max_purchase`, `spend_limit` or `usage_limit` (the last also carries a `usage_limit` window object).

```json
{ "type": "balances.usage_alert_triggered",
  "data": { "customer_id": "user_123", "feature_id": "api_calls",
            "usage_alert": { "name": "80% usage warning", "threshold": 80, "threshold_type": "usage_percentage" } } }
```

`threshold_type` is `usage` (absolute count) or `usage_percentage`.

```json
{ "type": "billing.auto_topup_failed", "id": "evt_auto_topup_failed_2abc123", "occurred_at": 1761840000000,
  "data": { "customer_id": "user_123", "feature_id": "credits", "reason": "charge_failed", "quantity": 1000,
            "threshold": 500, "balance": 250, "invoice_mode": false,
            "error": { "code": "card_declined", "message": "Your card was declined.", "type": "card_error" } } }
```

`billing.auto_topup_succeeded` has the same envelope with `quantity_granted`, `balance_after` and an `invoice` object (`stripe_id`, `status`, `total`, `currency`, `hosted_invoice_url`); Autumn suggests `invoice.stripe_id` as a dedupe key for it.

`invoice.finalized` carries the invoice as `invoices.list` returns it: `id`, `stripe_id`, `customer_id`, `entity_id`, `status`, `total`, `currency`, `plan_ids`, and `items[]` (capped at 100, each with an `entities` breakdown).

## Full Event Reference

See [Autumn's webhook documentation](https://docs.useautumn.com/documentation/webhooks) and the webhook pages in the [API reference](https://docs.useautumn.com/api-reference/webhooks/billingUpdated).
