# Recurly Webhooks Overview

## What Are Recurly Webhooks?

Recurly is a subscription management and recurring billing platform. Webhooks
(Recurly calls them **notifications**) are HTTP POST requests Recurly sends to
your endpoint whenever something happens on your site — a subscription is
created, a payment succeeds or fails, an invoice is issued, and so on.

Each notification is delivered as a separate request. A single real-world event
often produces several notifications: a new paid subscription generates both a
`new_subscription_notification` and a `successful_payment_notification`.

Notifications are configured per endpoint in the **Recurly Admin UI** (they
cannot be configured via the API). Each endpoint can subscribe to up to 10
notification types.

## Payload Formats: JSON vs XML

Recurly supports two payload formats, chosen per endpoint:

- **JSON (recommended).** Lightweight, and — importantly — **signed** with a
  `recurly-signature` header so you can verify authenticity. Prefer JSON.
- **XML (legacy).** Not signed. If you must use XML, secure the endpoint with
  HTTP Basic Auth and an IP allowlist instead of a signature.

### JSON payload structure (classic notifications)

Classic Recurly JSON notifications use the **notification type as the single
top-level key**, wrapping the related objects (`account`, `subscription`,
`transaction`, `invoice`, ...):

```json
{
  "new_subscription_notification": {
    "account": {
      "account_code": "1",
      "email": "verena@example.com",
      "first_name": "Verena",
      "last_name": "Example"
    },
    "subscription": {
      "plan": { "plan_code": "gold", "name": "Gold plan" },
      "uuid": "8435b96eb70e5640a0eaf82d0e0d6d",
      "state": "active",
      "quantity": 1,
      "total_amount_in_cents": 200,
      "activated_at": "2024-11-22T21:10:38Z"
    }
  }
}
```

A payment notification wraps `account` and `transaction`:

```json
{
  "successful_payment_notification": {
    "account": { "account_code": "1", "email": "verena@example.com" },
    "transaction": {
      "uuid": "a5143c1d3a6f4a8287d0e2cc1d4c0427",
      "invoice_number": 2059,
      "subscription_id": "1974a098jhlkjasdfljkha898326881c",
      "action": "purchase",
      "amount_in_cents": 1000,
      "status": "success"
    }
  }
}
```

To route a notification, read the top-level key:

```javascript
const notification = JSON.parse(rawBody);
const type = Object.keys(notification)[0];   // "successful_payment_notification"
const data = notification[type];             // { account, transaction }
```

> **Note:** Recurly also offers a newer "metadata-only" JSON envelope on some
> products (fields like `object_type`, `event_type`, `event_time`, `uuid`) that
> carries routing info rather than the full object. The examples in this skill
> target the classic notification format shown above, which matches the
> `*_notification` types listed below. Whichever you receive, always fetch the
> referenced object from the Recurly API to confirm its current state.

## Common Notification Types

### Subscription notifications

| Notification | Triggered When |
|--------------|----------------|
| `new_subscription_notification` | A subscription is created |
| `updated_subscription_notification` | A subscription is upgraded, downgraded, or otherwise changed |
| `canceled_subscription_notification` | A subscription is canceled |
| `expired_subscription_notification` | A subscription expires |
| `renewed_subscription_notification` | A subscription renews for a new billing term |
| `reactivated_account_notification` | A canceled subscription is reactivated |
| `paused_subscription_renewal_notification` | A subscription is paused |
| `subscription_paused_notification` | A subscription pause begins |
| `subscription_resumed_notification` | A paused subscription resumes |

### Payment / transaction notifications

| Notification | Triggered When |
|--------------|----------------|
| `successful_payment_notification` | A payment succeeds |
| `failed_payment_notification` | A payment is declined |
| `void_payment_notification` | A payment is voided before settlement |
| `successful_refund_notification` | A transaction is refunded |
| `scheduled_payment_notification` | An asynchronous payment is scheduled (ACH, SEPA) |
| `processing_payment_notification` | An asynchronous payment is processing |
| `transaction_status_updated_notification` | A gateway transaction status changes |

### Account & billing notifications

| Notification | Triggered When |
|--------------|----------------|
| `new_account_notification` | A new account is created |
| `updated_account_notification` | An account is updated |
| `canceled_account_notification` | An account is closed |
| `billing_info_updated_notification` | Billing info is added or updated |

### Invoice & dunning notifications

| Notification | Triggered When |
|--------------|----------------|
| `new_invoice_notification` | An invoice is created |
| `past_due_invoice_notification` | An invoice becomes past due |
| `new_dunning_event_notification` | A dunning event fires for a past-due invoice |

## Delivery & Retries

- Recurly retries failed deliveries with exponential backoff, up to **10
  attempts**, then stops. Notifications and their failure reasons are visible in
  the Admin console for **15 days**.
- Because of retries and separate-per-event delivery, **handle notifications
  idempotently** and return `2xx` quickly. Do heavy work asynchronously.

## Full Event Reference

For the complete list of notification types and payloads, see
[Recurly's Webhooks documentation](https://docs.recurly.com/recurly-subscriptions/docs/overview-webhooks).
