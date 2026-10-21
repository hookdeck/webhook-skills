# Lemon Squeezy Webhooks Overview

## What Are Lemon Squeezy Webhooks?

Lemon Squeezy is a merchant of record platform for digital products, subscriptions and license keys. Its webhooks notify your application of store events (new orders, subscription changes, license key creation) so you can provision access and keep billing state in sync.

When an event occurs, Lemon Squeezy sends a `POST` to your callback URL with a JSON:API resource body, an `X-Event-Name` header and an `X-Signature` header. Respond `200` to acknowledge; any other status is retried up to three more times with exponential backoff (for example 5s, 25s, 125s).

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `order_created` | A new order is placed | Grant access for one-time purchases, record the sale |
| `order_refunded` | An order is fully or partially refunded | Revoke access, adjust records |
| `subscription_created` | A new subscription is created (sent with `order_created`) | Start a subscription, store the subscription ID |
| `subscription_updated` | Any subscription data changes | Catch-all to keep status, plan and renewal date current |
| `subscription_cancelled` | Cancelled by the customer or store owner | Mark as cancelling; access continues until `ends_at` |
| `subscription_payment_success` | A subscription payment succeeds | Save billing history |
| `license_key_created` | A license key is created from a new order | Store or deliver the key |

Other events: `customer_updated`, `subscription_resumed`, `subscription_expired`, `subscription_paused`, `subscription_unpaused`, `subscription_payment_failed`, `subscription_payment_recovered`, `subscription_payment_refunded`, `license_key_updated`, `affiliate_activated`.

Lemon Squeezy recommends subscribing at minimum to `order_created` for single payments, and `subscription_created`, `subscription_payment_success` and `subscription_updated` for subscriptions.

## Event Payload Structure

```json
{
  "meta": {
    "event_name": "order_created",
    "custom_data": { "user_id": "42" }
  },
  "data": {
    "type": "orders",
    "id": "1",
    "attributes": {
      "store_id": 1,
      "customer_id": 1,
      "status": "paid",
      "total": 1199,
      "total_formatted": "$11.99"
    }
  }
}
```

- `meta.event_name` matches the `X-Event-Name` header.
- `meta.custom_data` holds data you passed through checkout (order, subscription and license key events).
- `data.type` is the resource (`orders`, `subscriptions`, `subscription-invoices`, `license-keys`, `customers`, ...).

## Full Event Reference

For the complete list of events and example payloads, see [Lemon Squeezy's webhook documentation](https://docs.lemonsqueezy.com/help/webhooks/event-types).
