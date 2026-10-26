# PayNow Webhooks Overview

## What Are PayNow Webhooks?

PayNow (paynow.gg) is a payments and storefront platform for game servers and creators. Instead of polling the API, you subscribe to events and PayNow sends a `POST` request to your URL when they occur. A webhook has an event, a URL, and a type. This skill covers the **JSON (v1)** type; the Discord (v1) type posts a templated embed to a Discord webhook URL and needs no receiver.

Delivery: return a `2xx` status to acknowledge. A status above 299 is retried automatically with exponential backoff for a reasonable period before the delivery is marked failed. PayNow also sends from a set list of IP addresses (listed on its [validation page](https://docs.paynow.gg/webhooks/validating-incoming-webhooks/); they are subject to change, so treat an allowlist as an extra layer, not a replacement for signature verification).

## Event Payload Structure

Every delivery is JSON with this envelope:

| Field | Description |
|-------|-------------|
| `event_type` | The event name, such as `ON_ORDER_COMPLETED` |
| `event_id` | The ID of the webhook event (use it to deduplicate) |
| `body` | The event object (order, payment, refund, delivery item, and so on) |

Example (`ON_PAYMENT_COMPLETED`, abridged):

```json
{
  "event_id": "411486491630370817",
  "event_type": "ON_PAYMENT_COMPLETED",
  "body": {
    "id": "411486491630370816",
    "amount": 7500,
    "currency": "USD",
    "gateway": "stripe",
    "order_id": "411486491630370816",
    "status": "completed",
    "store_id": "411486491630370816"
  }
}
```

Amounts are integers in cents. IDs are Flake IDs (strings).

## Common Event Types

These are the events the examples handle:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `ON_ORDER_COMPLETED` | An order is completed | Fulfil an order, grant access |
| `ON_PAYMENT_COMPLETED` | A payment is completed | Record revenue, send receipts |
| `ON_PAYMENT_FAILED` | A payment fails | Notify the customer |
| `ON_REFUND` | A refund is completed | Revoke access, adjust accounting |
| `ON_SUBSCRIPTION_RENEWED` | A subscription is renewed | Extend access |
| `ON_DELIVERY_ITEM_ADDED` | A delivery item is added to the customer's inventory | Sync in-game inventory |

## All Event Types

The event enum in PayNow's docs has 31 values; the Events page lists the ones you can subscribe to in the dashboard.

- **Chargebacks:** `ON_CHARGEBACK`, `ON_CHARGEBACK_CLOSED`, `ON_CHARGEBACK_LIFECYCLE`
- **Delivery items:** `ON_DELIVERY_ITEM_ADDED`, `ON_DELIVERY_ITEM_ACTIVATED`, `ON_DELIVERY_ITEM_USED`, `ON_DELIVERY_ITEM_RENEWED`, `ON_DELIVERY_ITEM_EXPIRED`, `ON_DELIVERY_ITEM_REVOKED`
- **Discord:** `ON_DISCORD_ACCOUNT_LINKED_TO_CHECKOUT`
- **Orders:** `ON_ORDER_COMPLETED`
- **Payments:** `ON_PAYMENT_COMPLETED`, `ON_PAYMENT_FAILED`
- **Refunds:** `ON_REFUND`
- **Subscriptions:** `ON_SUBSCRIPTION_ACTIVATED`, `ON_SUBSCRIPTION_CANCELED`, `ON_SUBSCRIPTION_RENEWED`
- **Trials:** `ON_TRIAL_ACTIVATED`, `ON_TRIAL_COMPLETED`, `ON_TRIAL_CANCELED`
- **Also in the enum:** `ON_CONNECTED_USER_REGISTERED`, `ON_CONNECTED_USER_BECAME_PAYABLE`, `ON_CONNECTED_USER_BECAME_UNPAYABLE`, `ON_CONNECTED_USER_PAYOUT_CREATED`, `ON_CONNECTED_USER_PAYOUT_COMPLETED`, `ON_CONNECTED_USER_TRANSACTION_INSERTED`, `ON_CONNECTED_USER_TRUST_STATUS_CHANGED`, `ON_PURCHASE_FOLLOW_UP_ATTEMPT_EMAIL_SENT`, `ON_PURCHASE_FOLLOW_UP_ATTEMPT_SUCCEEDED`, `ON_ABANDONED_CHECKOUT_RECOVERY_ATTEMPT_EMAIL_SENT`, `ON_ABANDONED_CHECKOUT_RECOVERY_ATTEMPT_SUCCEEDED`

## Full Event Reference

- [Webhook events](https://docs.paynow.gg/webhooks/events/) (one page per event with its payload)
- [Webhooks introduction](https://docs.paynow.gg/webhooks/webhooks-introduction)
- [Implementation examples](https://docs.paynow.gg/webhooks/integration-implementation-examples/)
