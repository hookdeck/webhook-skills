# Chargebee Webhooks Overview

## What Are Chargebee Webhooks?

Chargebee webhooks are HTTP callbacks that notify your application when events occur in your Chargebee account. They enable real-time updates about subscriptions, payments, customers, and other billing-related activities without polling the API.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `subscription_created` | New subscription is created | Provision user access, create account, send welcome email |
| `subscription_updated` | Subscription plan or state changes | Update user permissions, sync subscription data |
| `subscription_cancelled` | Customer cancels subscription | Schedule access revocation, trigger retention campaigns |
| `subscription_reactivated` | Cancelled subscription is reactivated | Restore user access, update billing status |
| `subscription_renewed` | Subscription auto-renews | Log renewal, send confirmation |
| `payment_succeeded` | Payment is successfully processed | Update payment status, send receipt |
| `payment_failed` | Payment attempt fails | Send payment failure notification, retry logic |
| `invoice_generated` | New invoice is created | Send invoice to customer, update accounting |
| `customer_created` | New customer record created | Create user account, sync customer data |
| `customer_updated` | Customer information changes | Update user profile, sync changes |

## Event Payload Structure

All Chargebee webhook events follow a consistent structure:

```json
{
  "id": "ev_16BHbhF4s42tO2lK",
  "occurred_at": 1704067200,
  "source": "admin_console",
  "object": "event",
  "api_version": "v2",
  "event_type": "subscription_created",
  "content": {
    "subscription": {
      "id": "16BHbhF4s42tO2lJ",
      "customer_id": "16BHbhF4s42tO2lI",
      "plan_id": "basic-monthly",
      "status": "active",
      "current_term_start": 1704067200,
      "current_term_end": 1706745600,
      "created_at": 1704067200
    },
    "customer": {
      "id": "16BHbhF4s42tO2lI",
      "email": "john@example.com",
      "first_name": "John",
      "last_name": "Doe"
    }
  }
}
```

### Key Fields

- `id`: Unique identifier for the webhook event
- `occurred_at`: Unix timestamp when the event occurred
- `event_type`: Type of event (e.g., subscription_created)
- `content`: Event-specific data containing affected resources
- `api_version`: API version used for the event format

## Webhook Delivery

### Timing and Order
- Webhooks are sent asynchronously after events occur
- Multiple webhooks may be sent simultaneously
- Events may arrive out of order
- Same event may be delivered multiple times (implement idempotency)

### Retry Mechanism
- Chargebee retries failed webhooks up to 7 times
- Retry intervals increase exponentially (2 minutes to 2 days)
- Webhook is marked failed if all retries are exhausted

### Response Requirements
- Your endpoint must return a 2XX status code
- Response body is ignored by Chargebee
- Timeouts: 20s connection, 20s read, 60s total execution

## Full Event Reference

For the complete list of events and their payloads, see [Chargebee's Event Types documentation](https://www.chargebee.com/docs/2.0/events_and_webhooks.html#event-types).