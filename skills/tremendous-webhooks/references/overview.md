# Tremendous Webhooks Overview

## What Are Tremendous Webhooks?

Tremendous (rewards and payouts) sends HTTPS POST requests to one receiver endpoint per organization whenever something happens in your account: orders created or approved, rewards delivered or failed, funding sources funded, invoices paid, and so on. Every request is signed with HMAC-SHA256 so you can confirm it came from Tremendous.

The receiver is notified about **every** event in the account. You can't pre-select events, so filter on the `event` field in your handler.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `REWARDS.DELIVERY.SUCCEEDED` | Tremendous received confirmation the reward email was delivered (not for LINK rewards) | Mark a payout delivered |
| `REWARDS.DELIVERY.FAILED` | Delivery failed, usually an email bounce (not for LINK rewards) | Ask the recipient for a new address |
| `REWARDS.CANCELED` | A reward was canceled | Update payout status |
| `REWARDS.FLAGGED` | A reward is flagged for fraud review | Hold downstream fulfilment |
| `ORDERS.CREATED` | An order was created (`payload.meta` is the Order) | Record the order |
| `ORDERS.APPROVED` | An admin approved the order (only when order approvals are on) | Release a pending payout |
| `ORDERS.CANCELED` | An order held for review was rejected | Cancel the payout in your system |
| `ORDERS.FAILED` | The order failed, typically a declined card | Alert finance |
| `CAMPAIGNS.CREATED` | A campaign was created in the UI | Sync campaign IDs |
| `FUNDING_SOURCES.FUNDED` | Funds were added and are available on your balance | Resume queued orders |
| `INVOICES.PAID` | An invoice was paid | Reconcile billing |

## Full Event List

All event names are uppercase and dotted:

- Campaigns: `CAMPAIGNS.CREATED`, `CAMPAIGNS.DELETED`
- Connected organizations: `CONNECTED_ORGANIZATIONS.DELETED`, `CONNECTED_ORGANIZATIONS.REGISTERED`, `CONNECTED_ORGANIZATIONS.STATUS.APPROVED`, `CONNECTED_ORGANIZATIONS.STATUS.REJECTED`, `CONNECTED_ORGANIZATIONS.OAUTH.GRANTED`, `CONNECTED_ORGANIZATION_MEMBERS.DELETED`
- Funding sources: `FUNDING_SOURCES.CREATED`, `FUNDING_SOURCES.DELETED`, `FUNDING_SOURCES.FUNDED`
- Invoices: `INVOICES.CREATED`, `INVOICES.DELETED`, `INVOICES.PAID`
- Members: `MEMBERS.CREATED`, `MEMBERS.DELETED`
- Orders: `ORDERS.APPROVED`, `ORDERS.CANCELED`, `ORDERS.CREATED`, `ORDERS.FAILED`
- Products: `PRODUCTS.ADDED`, `PRODUCTS.REMOVED`, `PRODUCTS.UPDATED`
- Rewards: `REWARDS.CANCELED`, `REWARDS.FLAGGED`, `REWARDS.DELIVERY.FAILED`, `REWARDS.DELIVERY.SUCCEEDED`
- Fraud reviews: `FRAUD_REVIEWS.RELEASED`, `FRAUD_REVIEWS.BLOCKED`
- Reports: `REPORTS.GENERATION.SUCCEEDED`, `REPORTS.GENERATION.FAILED`
- Topups: `TOPUPS.CREATED`, `TOPUPS.FULLY_CREDITED`, `TOPUPS.PARTIALLY_CREDITED`, `TOPUPS.REVERSED`, `TOPUPS.REJECTED`

## Event Payload Structure

```json
{
  "event": "CAMPAIGNS.CREATED",
  "uuid": "5ccc7bb1-7659-4e23-a407-77d8cd9c62f5",
  "created_utc": "2021-04-06T20:05:01.037-04:00",
  "payload": {
    "resource": { "id": "2V3PCCL7QXDA", "type": "campaigns" },
    "meta": {}
  }
}
```

| Field | Description |
|-------|-------------|
| `event` | Event type |
| `uuid` | Unique ID of the webhook itself; use it to avoid handling the same webhook twice |
| `created_utc` | When the event happened |
| `payload.resource.id` | Tremendous ID of the resource; fetch details with a separate API call |
| `payload.resource.type` | One of `campaigns`, `funding_sources`, `invoices`, `members`, `orders`, `organizations`, `payments`, `products`, `rewards` |
| `payload.meta` | Usually `{}`. `ORDERS.CREATED` returns the Order; `REWARDS.DELIVERY.FAILED` returns delivery-failure details |

## Retries and IPs

Your endpoint must return `200`. Otherwise Tremendous retries the same webhook up to 17 times with exponential backoff, so dedupe on `uuid`. Respond fast and process asynchronously. Requests come from fixed IPs (production and sandbox lists are in the docs).

## Full Event Reference

For the complete list and schemas, see [Tremendous's webhook documentation](https://developers.tremendous.com/docs/webhooks-1).
