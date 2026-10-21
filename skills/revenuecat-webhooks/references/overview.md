# RevenueCat Webhooks Overview

## What Are RevenueCat Webhooks?

RevenueCat is an in-app subscription platform that sits in front of the App Store, Google Play, Amazon, Stripe, Paddle, Roku and RevenueCat Billing. Its webhook integration sends a `POST` with a JSON body to your server whenever a subscription or purchase event happens, so your backend can keep entitlements in sync, trigger lifecycle automations, or react to billing problems.

Webhooks are a Pro plan integration. A project can have several webhook integrations (for example, one for production and one for sandbox), each with its own URL, Authorization header, HMAC signing secret, environment filter, app filter and event-type filter.

## Common Event Types

The type is in `event.type` (upper snake case).

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `TEST` | You click **Send test event** in the dashboard | Check your endpoint end to end |
| `INITIAL_PURCHASE` | A new subscription is purchased | Grant access, welcome flow |
| `RENEWAL` | A subscription renews, or a lapsed user resubscribes | Extend access, revenue reporting |
| `CANCELLATION` | A subscription or non-renewing purchase is canceled or refunded | Win-back flow; check `cancel_reason` (access continues until `EXPIRATION`) |
| `UNCANCELLATION` | A canceled, unexpired subscription is re-enabled | Stop win-back flow |
| `NON_RENEWING_PURCHASE` | A purchase that won't auto-renew | Grant consumable / lifetime access |
| `SUBSCRIPTION_PAUSED` | A pause is scheduled for the end of the period (Google Play) | Don't revoke access yet |
| `EXPIRATION` | A subscription expires | Revoke access; check `expiration_reason` |
| `BILLING_ISSUE` | A charge attempt fails | Ask the user to update payment details (not yet expired) |
| `PRODUCT_CHANGE` | A subscriber changes product (upgrade, downgrade, crossgrade) | Update plan; the change may not be in effect yet |
| `SUBSCRIPTION_EXTENDED` | The current period's expiration is pushed back | Extend access |
| `REFUND_REVERSED` | A refund is reversed (App Store) | Restore access |
| `INVOICE_ISSUANCE` | An unpaid invoice is issued (RevenueCat Billing) | Billing records |
| `TRANSFER` | Transactions and entitlements move between App User IDs | Move access between accounts |
| `TEMPORARY_ENTITLEMENT_GRANT` | RevenueCat grants temporary access during a store outage | Grant short-term access |
| `VIRTUAL_CURRENCY_TRANSACTION` | An in-app (virtual) currency transaction occurs | Update balances |
| `EXPERIMENT_ENROLLMENT` | A customer is enrolled in an experiment | Analytics |
| `PURCHASE_REDEEMED` | A Paddle, RevenueCat Billing or Stripe purchase is redeemed for an App User ID | Link web purchases to app users |
| `PRICE_INCREASE_CONSENT_REQUIRED` / `PRICE_INCREASE_CONSENT_APPROVED` | A price increase needs, or receives, customer consent | Prompt the user |

`SUBSCRIBER_ALIAS` is deprecated. RevenueCat may add new event types (and fields) without changing `api_version`, so return `200` for types you don't handle.

### Cancellation and expiration reasons

`cancel_reason` (on `CANCELLATION`) and `expiration_reason` (on `EXPIRATION`) take `UNSUBSCRIBE`, `BILLING_ERROR`, `DEVELOPER_INITIATED`, `PRICE_INCREASE`, `CUSTOMER_SUPPORT`, `UNKNOWN`, and (expiration only) `SUBSCRIPTION_PAUSED`.

## Event Payload Structure

`api_version` is at the root; everything else is inside `event`:

```json
{
  "api_version": "1.0",
  "event": {
    "id": "UniqueIdentifierOfEvent",
    "type": "INITIAL_PURCHASE",
    "event_timestamp_ms": 1591121855319,
    "app_id": "yourAppID",
    "app_user_id": "yourCustomerAppUserID",
    "original_app_user_id": "OriginalAppUserID",
    "aliases": ["yourCustomerAliasedID"],
    "product_id": "onemonth_no_trial",
    "entitlement_ids": ["pro_cat"],
    "period_type": "NORMAL",
    "purchased_at_ms": 1591121853000,
    "expiration_at_ms": 1591726653000,
    "environment": "PRODUCTION",
    "store": "APP_STORE",
    "price": 2.49,
    "currency": "USD",
    "transaction_id": "170000869511114",
    "original_transaction_id": "1530648507000"
  }
}
```

Key fields:

- `event.id` — unique per event. **Retries reuse the same `id` and `event_timestamp_ms`**, so deduplicate on `id`.
- `environment` — `SANDBOX` or `PRODUCTION`, taken from the store transaction. The same customer can have both.
- `app_user_id`, `original_app_user_id`, `aliases` — when looking users up, search both `original_app_user_id` and `aliases`.
- Many fields are only sometimes present, and "always" fields can be `null`. Parse defensively.

RevenueCat recommends calling `GET /subscribers/{app_user_id}` after any webhook and syncing from that response, rather than writing per-event logic.

## Delivery Behaviour

- Your endpoint must return **`200`**. Any other status (including `201`, `202` or `204`) is a failure.
- Failed deliveries are retried up to 5 times with exponential backoff (about 2.5, 5, 10, 20 and 40 minutes, with jitter): roughly 80 minutes in total. Then RevenueCat stops.
- Responses that take longer than 60 seconds are disconnected and retried. Respond first and process asynchronously.
- Most events arrive within 5–60 seconds; cancellations can take up to about 2 hours.
- Delivery is at least once, so duplicates are possible.
- Failed or retrying events can be resent with **Retry** on the integration page or the event details page.

## Full Event Reference

- [Webhooks](https://www.revenuecat.com/docs/integrations/webhooks)
- [Event types and fields](https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields)
- [Sample events](https://www.revenuecat.com/docs/integrations/webhooks/sample-events)
