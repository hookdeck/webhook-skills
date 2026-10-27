# Dodo Payments Webhooks Overview

## What Are Dodo Payments Webhooks?

[Dodo Payments](https://dodopayments.com) is a merchant-of-record payments platform. It sends an HTTP POST with a JSON body to every webhook endpoint you add under **Developer > Webhooks** whenever something happens to a payment, refund, dispute, subscription, license key, entitlement grant, credit balance, checkout, dunning attempt or payout. Deliveries follow the [Standard Webhooks](https://standardwebhooks.com/) specification and are signed with the endpoint's `whsec_` secret.

You can also pick an integration connector (Slack, Discord, Zapier, Resend, SendGrid and others) instead of a URL; connectors transform the events for you and need no handler.

## Event Payload Structure

```json
{
  "business_id": "bus_H4ekzPSlcg",
  "type": "payment.succeeded",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "payload_type": "Payment"
  }
}
```

| Field | Meaning |
|-------|---------|
| `business_id` | Your Dodo Payments business identifier |
| `type` | The event type, for example `payment.succeeded`. This is what handlers switch on |
| `timestamp` | ISO 8601 time the event occurred. Use it to order events |
| `data` | Event-specific payload. Fields vary per event |
| `data.payload_type` | Resource kind: `Payment`, `Subscription`, `Refund`, `Dispute`, `LicenseKey`, `CreditLedgerEntry`, `CreditBalanceLow`, `AbandonedCheckout`, `DunningAttempt`, `EntitlementGrant` or `Payout`. It names the resource, not the event |

There is no event id in the body. The `webhook-id` header is unique per message and stable across retries, so it is the idempotency key.

## Common Event Types

The examples route these events and log the rest:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `payment.succeeded` | A payment is successfully processed | Fulfil an order, grant access |
| `payment.failed` | A payment attempt fails (declined card, insufficient funds, other errors) | Notify the customer, retry flow |
| `payment.processing` | A payment is being processed | Show a pending state |
| `payment.cancelled` | A payment is cancelled before completion | Release reserved stock |
| `refund.succeeded` | A refund is successfully processed | Revoke access, update accounting |
| `refund.failed` | A refund attempt fails | Alert finance |
| `dispute.opened` | A cardholder opens a dispute on a payment | Gather evidence |
| `dispute.won` | The dispute is resolved in your favour | Close the case |
| `dispute.lost` | The dispute is resolved in the cardholder's favour | Adjust revenue, revoke access |
| `subscription.active` | A subscription is activated and recurring charges are scheduled | Provision the plan |
| `subscription.renewed` | A subscription renews for the next billing period | Extend access |
| `subscription.on_hold` | A subscription is temporarily put on hold due to a failed renewal | Restrict access, ask for a new payment method |
| `subscription.cancelled` | The merchant or customer cancels a subscription | Schedule deprovisioning |
| `license_key.created` | A new license key is created for a product | Deliver the key |

## Full Event List

Dodo documents 48 event types (the list may not be exhaustive, so ignore types you don't recognise):

| Resource | Events |
|----------|--------|
| Payment | `payment.succeeded`, `payment.failed`, `payment.processing`, `payment.cancelled` |
| Refund | `refund.succeeded`, `refund.failed` |
| Dispute | `dispute.opened`, `dispute.challenged`, `dispute.accepted`, `dispute.cancelled`, `dispute.expired`, `dispute.won`, `dispute.lost` |
| Subscription | `subscription.active`, `subscription.updated`, `subscription.past_due`, `subscription.on_hold`, `subscription.paused`, `subscription.unpaused`, `subscription.renewed`, `subscription.plan_changed`, `subscription.update_payment_method`, `subscription.cancelled`, `subscription.failed`, `subscription.expired` |
| License key | `license_key.created` |
| Entitlement grant | `entitlement_grant.created`, `entitlement_grant.delivered`, `entitlement_grant.failed`, `entitlement_grant.revoked` |
| Credit | `credit.added`, `credit.deducted`, `credit.expired`, `credit.rolled_over`, `credit.rollover_forfeited`, `credit.overage_charged`, `credit.overage_reset`, `credit.manual_adjustment`, `credit.balance_low` |
| Recovery | `abandoned_checkout.detected`, `abandoned_checkout.recovered` |
| Dunning | `dunning.started`, `dunning.recovered` |
| Payout | `payout.created`, `payout.in_progress`, `payout.on_hold`, `payout.success`, `payout.failed` |

`payout.created` was previously emitted as `payout.not_initiated`; update any endpoint filter that still uses the old name.

## Delivery Behaviour

- **Acknowledge** with any `2xx`. Anything else is a failure and is retried.
- **Timeout:** 30 seconds for connect and read. Return `200` first, then process asynchronously.
- **Retries:** exponential backoff, 8 attempts in all: immediately, then after 5 seconds, 5 minutes, 30 minutes, 2 hours, 5 hours, 10 hours and 10 hours (final).
- **Replay:** failed messages can be replayed manually, or recovered in bulk for a time range, from the dashboard.
- **Ordering:** events can arrive out of order. Use `timestamp` to order them. Payout events are neither terminal nor strictly ordered: `payout.failed` can follow `payout.success` when a bank returns the transfer.
- **Throttling:** optional per-endpoint rate limits queue deliveries instead of dropping them.

## Full Event Reference

For payload schemas of every event, see [Dodo Payments' webhook documentation](https://docs.dodopayments.com/developer-resources/webhooks) and its [Webhook Events Guide](https://docs.dodopayments.com/developer-resources/webhooks/intents/webhook-events-guide).
