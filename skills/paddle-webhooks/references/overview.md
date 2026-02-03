# Paddle Webhooks Overview

## What Are Paddle Webhooks?

Paddle uses webhooks (called "notifications" in Paddle) to notify your application when events occur in your account. Instead of polling the API for changes, Paddle sends HTTP POST requests to your configured endpoint URL whenever something happens—like a successful transaction, a subscription creation, or a customer update.

When something notable occurs in your system, Paddle creates an event entity with information about what happened and when. You can set up a notification destination to tell Paddle to deliver notifications when events occur.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `subscription.created` | New subscription is created | Welcome emails, initial provisioning |
| `subscription.activated` | Subscription becomes active after first payment | Provision access, start trial conversion |
| `subscription.updated` | Subscription details change | Update entitlements, sync billing info |
| `subscription.canceled` | Subscription is canceled | Revoke access, retention emails |
| `subscription.paused` | Subscription is paused | Limit access, send pause confirmation |
| `subscription.resumed` | Subscription is resumed | Restore access, welcome back emails |
| `transaction.completed` | Transaction completes successfully | Fulfill orders, send receipts |
| `transaction.payment_failed` | Payment attempt fails | Dunning emails, retry notifications |
| `customer.created` | New customer is created | Welcome sequence, CRM sync |
| `customer.updated` | Customer details are updated | Update records, sync changes |
| `address.created` | New address is added | Update shipping, tax calculations |
| `business.created` | Business entity is created | B2B workflow triggers |

## Event Payload Structure

All Paddle webhook events share a common structure:

```json
{
  "event_id": "evt_01h8bzakzx3hm2fmen703n5q45",
  "event_type": "subscription.created",
  "occurred_at": "2024-01-15T12:30:00.000Z",
  "notification_id": "ntf_01h8bzam7dqq5r4a83sxtv5j0z",
  "data": {
    "id": "sub_01h8bzakzx3hm2fmen703n5q45",
    "status": "active",
    "customer_id": "ctm_01h8bzakzx3hm2fmen703n5q45",
    "items": [...],
    "billing_cycle": {...},
    "current_billing_period": {...}
  }
}
```

Key fields:
- `event_type` - The event type (e.g., `subscription.created`)
- `data` - The full Paddle entity that triggered the event
- `occurred_at` - When the event occurred (ISO 8601 timestamp)
- `event_id` - Unique event ID (use for idempotency)
- `notification_id` - Unique ID for this delivery attempt

## Event Ordering

Paddle cannot guarantee the order of delivery for webhooks. They may be delivered in a different order than they're generated. Store and check the `occurred_at` date against a webhook before making changes to handle out-of-order delivery.

## Full Event Reference

For the complete list of events, see [Paddle's webhook events documentation](https://developer.paddle.com/webhooks/overview).

For detailed payload schemas per event type, see [Paddle API Reference](https://developer.paddle.com/api-reference/overview).
