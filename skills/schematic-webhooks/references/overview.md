# Schematic Webhooks Overview

## What Are Schematic Webhooks?

Schematic (schematichq.com) is a pricing, entitlement and feature-flag platform. Its webhooks notify your service when company, user, catalog (features, flags, plans), billing or usage-trigger data changes, so you can raise alerts or keep external systems in sync.

Each webhook is a `POST` with a JSON body. The `action` field names the event.

## Event Payload Structure

```json
{
  "action": "company.created",
  "account_id": "acct_xxxxxxx",
  "environment_id": "env_xxxxxxxx",
  "event_id": "whe_xxxxxxxx",
  "object_type": "company",
  "body": {},
  "company_id": "comp_xxxxxxxx",
  "feature_id": "feat_xxxxxxxx"
}
```

| Field | Description |
|-------|-------------|
| `action` | Event type, e.g. `company.created` |
| `account_id` | Account the event occurred in |
| `environment_id` | Environment within the account |
| `event_id` | Identifies this event and endpoint pair; stable across retries |
| `object_type` | Type of object the event relates to |
| `body` | Event-specific data; shape varies by event |
| `company_id` | Present on company-scoped and entitlement trigger events |
| `feature_id` | Present on entitlement trigger events |

Test sends from the dashboard carry no `event_id` or `X-Schematic-Webhook-Id`.

## Common Event Types

All 39 events, as listed in Schematic's documentation:

| Group | Events |
|-------|--------|
| Company & user | `company.created`, `company.updated`, `company.deleted`, `company.plan_changed`, `company.override.created`, `company.override.updated`, `company.override.deleted`, `company.override.expired`, `user.created`, `user.updated`, `user.deleted` |
| Catalog | `feature.created`, `feature.updated`, `feature.deleted`, `flag.created`, `flag.updated`, `flag.deleted`, `flag_rules.updated`, `rule.deleted`, `plan.created`, `plan.updated`, `plan.deleted`, `plan_version.deleted`, `plan.entitlement.created`, `plan.entitlement.updated`, `plan.entitlement.deleted` |
| Billing | `subscription.trial.ended` |
| Usage triggers | `entitlement.limit.reached`, `entitlement.limit.warning`, `entitlement.soft_limit.reached`, `entitlement.soft_limit.warning`, `entitlement.tier_limit.reached`, `entitlement.tier_limit.warning`, `credit.limit.reached`, `credit.limit.warning`, `credit.purchase.success`, `auto.topup.hard.failure`, `auto.topup.retry.exceeded`, `auto.topup.success` |

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `company.created` | A company is created | Provision accounts, sync CRM |
| `company.plan_changed` | A company changes plan | Update entitlements, notify sales |
| `plan.created` | A plan is added to the catalog | Refresh pricing pages |
| `flag.updated` | A flag changes | Invalidate flag caches |
| `subscription.trial.ended` | A trial ends | Trigger conversion emails |
| `entitlement.limit.reached` | Usage hits a limit | Block usage, prompt an upgrade |

Payload types for each event are published in Schematic's Node.js, Go, C#, Java and Python SDKs.

## Delivery

- Respond with any `2xx` within 5 seconds; anything else (including `3xx`) fails.
- Eight attempts over about 24 hours (immediately, then +30s, +5m, +30m, +2h, +5h, +10h, +24h from the first attempt, jittered ±10%), then the event is dropped.
- The body is identical on every attempt; the timestamp and signature are fresh.
- Endpoints with a failure rate of 90% or more across at least 25 events in 24 hours are deactivated; re-enable them from the webhooks page.
- Order is not guaranteed: compare timestamps in `body` when order matters.

## Full Event Reference

See [Schematic's webhook documentation](https://docs.schematichq.com/integrations/webhooks).
