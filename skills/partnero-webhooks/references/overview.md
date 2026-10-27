# Partnero Webhooks Overview

## What Are Partnero Webhooks?

Partnero's outgoing webhooks send an HTTP `POST` to your server when events occur in your program
(partners, customers, transactions, rewards). You add them per program under Program Settings >
Webhooks, or through the Webhooks API. Your endpoint should return a `2xx` within 5 seconds.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `partner.created` | New partner signs up or is created | Welcome email, mailing list, CRM |
| `partner.updated` | Partner information is updated | Sync profile data |
| `partner.approved` | Partner application is approved | Grant access, notify the partner |
| `partner.rejected` | Partner application is rejected | Notify, clean up |
| `partner.archived` | Partner is archived | Deactivate downstream accounts |
| `partner.deleted` | Partner is deleted | Remove records |
| `customer.created` | New customer is created | Attribute a referral |
| `customer.updated` | Customer information is updated | Sync customer data |
| `customer.deleted` | Customer is deleted | Remove records |
| `transaction.created` | New transaction is recorded | Update CRM, accounting |
| `transaction.updated` | Transaction is updated | Reconcile amounts |
| `transaction.deleted` | Transaction is deleted (refund) | Reverse accounting entries |
| `reward.created` | Commission/reward is created | Track pending commissions |
| `reward.approved` | Reward is approved for payout | Schedule payout reminders |
| `reward.paid` | Reward is marked as paid | Reconcile payouts |

## Event Payload Structure

All webhooks share one envelope; the event-specific fields are under `data`:

```json
{
  "event": "partner.created",
  "url": "https://your-server.com/webhooks/partnero",
  "webhook_key": "wh_abc123",
  "created_at": "2025-01-15T10:30:00.000000Z",
  "data": {
    "id": "partner_abc123",
    "email": "partner@partnero.com",
    "name": "John",
    "surname": "Doe",
    "status": "approved",
    "created_at": "2025-01-15T10:30:00.000000Z",
    "metadata": {}
  }
}
```

| Field | Description |
|-------|-------------|
| `event` | The event name, e.g. `transaction.created` |
| `url` | The destination URL the webhook was sent to |
| `webhook_key` | Key of the webhook subscription that fired |
| `created_at` | ISO 8601 timestamp of when the event was dispatched |
| `data` | Event-specific payload |

The docs also show `transaction.created` data as `{key, amount, currency, action, customer, partner, reward, created_at}` and
`reward.approved` data as `{id, amount, currency, partner, transaction_key, approved_at}`. The shape of `data` differs
per event, so read fields defensively.

## Delivery and Retries

Return a `2xx` within 5 seconds and process asynchronously. Failed deliveries are retried with backoff:

| Attempt | Delay |
|---------|-------|
| 1 | Immediate |
| 2 | 1 minute |
| 3 | 5 minutes |
| 4 | 30 minutes |
| 5 | 2 hours |

After 5 failed attempts the webhook is marked failed in the Partnero dashboard logs. Deduplicate
on your own keys because retries re-send the same event.

## Full Event Reference

See [Partnero's outgoing webhooks documentation](https://docs.partnero.com/guides/webhooks/outgoing-webhooks).
