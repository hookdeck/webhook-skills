# Stigg Webhooks Overview

## What Are Stigg Webhooks?

Stigg, a pricing and entitlements platform, POSTs a JSON event to your endpoint when something changes on the platform: customers, subscriptions, plans, features, entitlements, credits. You choose which events each webhook receives. Webhooks are created under **Settings > Integrations > Webhooks** and start streaming immediately.

Stigg does not sign payloads. Each request carries the webhook's secret in the `Stigg-Webhooks-Secret` header, and you compare it with the secret on the webhook details page. HMAC signatures are on Stigg's roadmap.

## Common Event Types

The event name is in the payload's `type` field.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `customer.created` | A customer is created | Create CRM records, billing profiles |
| `customer.updated` | A customer changes | Sync profile data |
| `customer.deleted` | A customer is deleted | Clean up downstream records |
| `customer.payment_failed` | A customer payment fails | Dunning, notify the customer |
| `subscription.created` | A subscription is created | Provision access and billing hooks |
| `subscription.updated` | A subscription changes | Plan changes, upgrades, downgrades |
| `subscription.canceled` | A subscription is canceled | Schedule offboarding |
| `subscription.expired` | A subscription expires | Revoke access |
| `subscription.trial_started` / `subscription.trial_converted` / `subscription.trial_expired` | Trial lifecycle | Onboarding and conversion tracking |
| `subscription.trial.ends_soon` | A trial is about to end | Reminder emails |
| `subscription.billing_month.ends_soon` | A billing month is about to end | Usage reporting |
| `subscription.spend_limit.exceeded` | A spend limit is exceeded | Alerts |
| `subscription.create_failed` | Subscription creation fails | Error handling |
| `entitlements.updated` | A customer's effective entitlements change | Recompute access gates |
| `entitlement.usage_exceeded` | Usage passes an entitlement limit | Upsell, throttling |
| `promotionalEntitlement.granted` / `.updated` / `.revoked` / `.ends_soon` / `.expired` | Promotional entitlement lifecycle | Access gates |

Catalog events (`product.*`, `plan.*`, `addon.*`, `feature.*`, `feature_group.*`, `coupon.*`) and credit events (`credits.granted`, `credits.balance.updated`, and others) also exist, along with `sync.failed` and `data_export.sync_failed`.

## Event Payload Structure

Every event shares an envelope:

```json
{
  "type": "subscription.created",
  "messageId": "a6ce...",
  "traceId": "549a...",
  "timestamp": "2022-04-10T00:00:00.001Z",
  "entityId": "customer-uuid",
  "id": "subscription-id",
  "status": "ACTIVE",
  "customer": { "id": "customer-test-id", "email": "john@example.com" },
  "plan": { "id": "plan-test-id", "name": "plan-test-name" }
}
```

`timestamp` can be omitted on some events. Use `messageId` to de-duplicate: retries and resends reuse it. Stigg does not guarantee delivery order.

## Retries

Stigg needs a 2xx within 30 seconds. On an error or timeout it retries 3 times immediately, then 3 times every 30 seconds, then marks the event failed. Stored events can be resent on request. Webhooks may come from `18.119.35.43` (the list can change).

## Full Event Reference

See Stigg's [webhooks documentation](https://docs.stigg.io/documentation/native-integrations/events/webhooks) and the [webhook events reference](https://docs.stigg.io/openapi/stigg-webhooks.yaml) for every event and payload.
