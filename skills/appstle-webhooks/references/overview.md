# Appstle Webhooks Overview

## What Are Appstle Webhooks?

Appstle Subscriptions sends real-time HTTP `POST` notifications when subscription events
happen in your Appstle account (a subscription is created, paused, cancelled, or a
payment succeeds or fails). They replace polling the Appstle API.

Delivery runs on [Svix](https://www.svix.com/), so every request carries `svix-id`,
`svix-timestamp`, and `svix-signature` headers (see [verification.md](verification.md)).

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
| `subscription.billing-failure` | Payment failed | Billing attempt |
| `subscription.billing-skipped` | Billing cycle skipped | Billing attempt |
| `subscription.upcoming-order-notification` | Upcoming order reminder sent | Billing attempt |

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
| `id` | Billing attempt record ID |
| `shop` | Shopify store domain |
| `billingAttemptId` | Shopify GraphQL billing attempt ID |
| `contractId` | Numeric subscription contract ID (no `gid://` prefix) |
| `status` | `SUCCESS`, `FAILURE`, `SKIPPED`, or `PENDING` |
| `billingDate`, `attemptTime`, `attemptCount` | Scheduled date, actual attempt time, attempts this cycle |
| `orderId`, `orderName`, `graphOrderId`, `orderAmount` | Present when the attempt succeeded |
| `retryingNeeded` | Whether an automatic retry is scheduled |
| `billingAttemptResponseMessage` | Error message if failed or skipped |

## How Are Failed Deliveries Retried?

If your endpoint doesn't return `2xx`, Svix retries with exponential backoff over 5
attempts across 3 days, and automatically disables endpoints that fail consistently.
Retries reuse the same `svix-id` (use it for idempotency) and the original
`svix-timestamp` (see the timestamp note in [verification.md](verification.md)). You can
also retry from **Settings → Webhooks → Message Logs**.

## Full Event Reference

See [Appstle's webhook documentation](https://developers.appstle.com/subscription/webhooks).
