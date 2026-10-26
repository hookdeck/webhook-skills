# Purchasely Webhooks Overview

## What Are Purchasely Webhooks?

Purchasely can send real-time server events to your backend over a webhook. They cover the
subscription lifecycle (activation, renewal, plan changes, billing issues, churn), offer events
(trials, intro and promotional offers), transactional events (revenue per transaction) and
entitlement events (`ACTIVATE` / `DEACTIVATE`). Each event is a `POST` with a JSON body; the
`event_name` field says which event it is.

Delivery rules (from the docs):

- Acknowledge with **exactly HTTP 200**. Any other code, other 2xx included, is retried: 25 times over
  about 20 days (20s, then growing backoff).
- A non-200 **pauses later webhooks for that user** until the first one succeeds, so events stay in order.
- Events for anonymous users can arrive before login. Return `200` and ignore them; the subscription is
  associated with the user on login and you then get the matching event.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `SUBSCRIPTION_STARTED` | A subscription is purchased | Grant access, onboarding |
| `SUBSCRIPTION_RENEWED` | The subscription renews | Extend access, track retention |
| `RENEWAL_DISABLED` | The customer cancels auto-renewal in device settings | Win-back campaigns |
| `RENEWAL_ENABLED` | Auto-renewal is turned back on | Clear churn flags |
| `GRACE_PERIOD_STARTED` | A billing issue occurs at renewal (grace period) | Ask for a new payment method |
| `ENTERED_BILLING_RETRY` | A billing issue occurs at renewal (billing retry) | Same |
| `SUBSCRIPTION_TERMINATED` | The subscription ends; no active subscription remains | Revoke access |
| `RETENTION_MESSAGE_REQUESTED` | Apple asked for a retention message (cancel sheet opened; not a cancellation) | Measure save rate |
| `TRANSACTION_PROCESSED` | A transaction is processed | Revenue reconciliation |
| `ACTIVATE` | An entitlement is activated | Unlock features |

## All Documented Event Names

Lifecycle: `SUBSCRIPTION_STARTED`, `SUBSCRIPTION_RENEWED`, `SUBSCRIPTION_TERMINATED`,
`SUBSCRIPTION_UPGRADED`, `SUBSCRIPTION_DOWNGRADED`, `SUBSCRIPTION_CROSSGRADED`,
`SUBSCRIPTION_REACTIVATED`, `SUBSCRIPTION_DEFERRED`, `SUBSCRIPTION_RECEIVED`,
`SUBSCRIPTION_TRANSFERRED`, `SUBSCRIPTION_PAUSED`, `SUBSCRIPTION_UNPAUSED`,
`SUBSCRIPTION_WILL_PAUSE`, `SUBSCRIPTION_WILL_NOT_PAUSE`, `SUBSCRIPTION_CANCELLED_DURING_PAUSE`,
`SUBSCRIPTION_REFUNDED`, `SUBSCRIPTION_REFUNDED_REVOKED`, `SUBSCRIPTION_REFUND_REVERSED`,
`RENEWAL_DISABLED`, `RENEWAL_ENABLED`, `FAMILY_SHARED_REVOKED`, `RETENTION_MESSAGE_REQUESTED`,
`GRACE_PERIOD_STARTED`, `GRACE_PERIOD_TERMINATED`, `SUBSCRIPTION_CANCELLED_DURING_GRACE_PERIOD`,
`SUBSCRIPTION_RECOVERED_FROM_GRACE_PERIOD`, `ENTERED_BILLING_RETRY`,
`SUBSCRIPTION_RECOVERED_FROM_BILLING_RETRY`, `INSTALLMENT_PAID`, `INSTALLMENT_REFUNDED`,
`ONE_TIME_PURCHASE_RECEIVED`, `ONE_TIME_PURCHASE_TRANSFERRED`, `ONE_TIME_PURCHASE_REFUND_REVERSED`.

Offers: `TRIAL_STARTED`, `TRIAL_CONVERTED`, `TRIAL_NOT_CONVERTED`, `INTRO_OFFER_CONVERTED`,
`PROMOTIONAL_OFFER_NOT_CONVERTED` (and related). Transactional: `TRANSACTION_PROCESSED`.
Entitlements: `ACTIVATE`, `DEACTIVATE`.

Purchasely documents 47 event types and may add more; handle the ones you need and return `200` for the rest.

## Event Payload Structure

Fields seen in the documented samples (`SUBSCRIPTION_STARTED`, `SUBSCRIPTION_RENEWED`,
`TRANSACTION_PROCESSED`, `ACTIVATE`, ...):

| Field | Meaning |
|-------|---------|
| `event_id` | Unique event ID (use for deduplication) |
| `event_name` | The event type (dispatch on this) |
| `event_created_at` / `event_created_at_ms` | When the event was created |
| `api_version` | Payload version (3 in the samples) |
| `environment` | `SANDBOX` or `PRODUCTION` |
| `user_id` / `anonymous_user_id` | Your user ID, or Purchasely's for anonymous users |
| `purchasely_subscription_id` | Purchasely's subscription ID |
| `product`, `plan`, `store`, `store_product_id` | What was bought and where |
| `purchase_type`, `offer_type`, `subscription_status` | Purchase and state details |
| `next_renewal_at`, `effective_next_renewal_at` | Renewal dates (ISO and `_ms`) |
| `amount_in_eur`, `amount_in_customer_currency` | Present on `TRANSACTION_PROCESSED` |

## Full Event Reference

See [Purchasely's webhook documentation](https://docs.purchasely.com/docs/webhook) and
[lifecycle events](https://docs.purchasely.com/docs/lifecycle-events).
