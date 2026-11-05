# Appstle Webhooks Overview

## What Are Appstle Webhooks?

Appstle Subscriptions sends real-time HTTP `POST` notifications when subscription events
happen in your Appstle account (a subscription is created, paused, cancelled, or a
payment succeeds or fails). They replace polling the Appstle API.

Every request carries `svix-id`, `svix-timestamp`, and `svix-signature` headers, which follow
[Svix](https://www.svix.com/)'s scheme (see [verification.md](verification.md)). Webhooks are
included in the Enterprise and Enterprise Plus plans.

## What Event Types Does Appstle Send?

| Event | Triggered When | Payload |
|-------|----------------|---------|
| `subscription.created` | New subscription created | Subscription contract |
| `subscription.updated` | Subscription details updated | Subscription contract |
| `subscription.activated` | Subscription activated | Subscription contract |
| `subscription.paused` | Subscription paused | Subscription contract |
| `subscription.cancelled` | Subscription cancelled | Subscription contract |
| `subscription.next-order-date-changed` | Next order date modified | Subscription contract |
| `subscription.billing-interval-changed` | Billing frequency changed | Subscription contract |
| `subscription.billing-success` | Payment processed successfully | Billing attempt |
| `subscription.billing-failure` | A payment try failed (sent after every failed try) | Billing attempt |
| `subscription.billing-skipped` | Billing cycle skipped | Billing attempt |
| `subscription.upcoming-order-notification` | A queued order came inside its notice period, whether or not the email is on | Billing attempt with contract fields |

Your endpoint should tolerate event types not listed here.

## What Does the Payload Look Like?

Every webhook uses one envelope. Read the event name from `type`:

```json
{
  "type": "subscription.created",
  "data": { }
}
```

### Subscription contract (`subscription.created`, `.updated`, `.activated`, `.paused`, `.cancelled`, `.next-order-date-changed`, `.billing-interval-changed`)

`data` is a Shopify-style subscription contract, for example:

| Field | Notes |
|-------|-------|
| `id` | e.g. `gid://shopify/SubscriptionContract/12345` |
| `status` | e.g. `ACTIVE` |
| `nextBillingDate`, `createdAt`, `updatedAt` | Dates |
| `billingPolicy`, `deliveryPolicy` | `interval` (`DAY`, `WEEK`, `MONTH`, `YEAR`), `intervalCount`, `maxCycles`, `minCycles` |
| `lines.nodes` | Line items |
| `customer`, `customerPaymentMethod`, `deliveryMethod` | Customer, payment and delivery details |
| `discounts.nodes`, `note`, `customAttributes` | Discounts, notes, custom attributes |

### Billing attempt (`subscription.billing-success`, `.billing-failure`, `.billing-skipped`, `.upcoming-order-notification`)

| Field | Notes |
|-------|-------|
| `id` | Appstle's ID for the billing attempt; stays the same across retries |
| `shop` | Shopify store domain |
| `billingAttemptId` | Shopify GraphQL ID of the latest try; `null` until the first is accepted |
| `contractId` | Numeric subscription contract ID (no `gid://` prefix) |
| `status` | `SUCCESS`; `FAILURE` (or `SKIPPED_DUNNING_MGMT` on the last failed try when the store skips the order); `QUEUED` on upcoming-order-notification; `SKIPPED`, `SKIPPED_INVENTORY_MGMT` or `SKIPPED_DUNNING_MGMT` on billing-skipped |
| `billingDate`, `attemptTime`, `attemptCount` | Scheduled date, latest try, tries so far for this attempt |
| `orderId`, `orderName`, `graphOrderId`, `orderAmount` | Present when the attempt succeeded |
| `retryingNeeded` | On billing-failure, whether Appstle has scheduled another try. Queued attempts also report `true`, so read it only on billing-failure |
| `billingAttemptResponseMessage` | Usually a JSON string with `error_code` and `error_message`, sometimes plain text. Not cleared by a later success, so read it only on billing-failure |

## How Are Failed Deliveries Retried?

If your endpoint doesn't return `2xx`, Appstle retries with exponential backoff. It doesn't
publish the number of attempts or how long they run. Retries reuse the same `svix-id` (use
it for idempotency) and carry a new `svix-timestamp`. You can also view attempts and retry
by hand in the webhook portal (**More → Webhook Integration → Launch webhook portal**).

## Full Event Reference

See [Appstle's webhook documentation](https://developers.appstle.com/subscription/webhooks).
