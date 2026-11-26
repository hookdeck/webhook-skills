# Prive Webhooks Overview

## What Are Prive Webhooks?

Prive is a Shopify subscriptions app, now **Recurly Commerce**. Its public API lets a merchant create webhooks that Prive calls when subscription, order, billing or payment-method data changes. Each webhook subscribes to a single topic and is signed with HMAC-SHA256 in the `x-prive-hmac-sha256` header.

## Webhook Topics

| Topic | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `subscriptions/created` | A subscription is created | Onboarding, CRM sync |
| `subscriptions/line_removed` | A line is removed from a subscription | Churn analysis, inventory |
| `subscriptions/status/updated` | A subscription's status changes | Pause/cancel handling |
| `orders/created` | A subscription order is created | Fulfillment, OMS sync |
| `billingAttempts/created` | A billing attempt is created | Billing monitoring |
| `billingAttempts/success` | A billing attempt succeeds | Revenue recording |
| `billingAttempts/failed` | A billing attempt fails | Dunning, customer outreach |
| `paymentMethod/updated` | A payment method is updated | Retry failed payments |
| `subscriptionActivities/created` | A subscription activity is created | Audit trail |
| `subscription/customAttributes/updated` | A subscription's custom attributes change | Data sync |

## Event Payload Structure

Every payload follows the same structure ([Recurly Commerce webhooks](https://docs.recurly.com/recurly-commerce/docs/webhooks)):

```json
{
  "topic": "billingAttempts/failed",
  "idempotencyKey": "...",
  "data": {}
}
```

`topic` names the event and `data` holds the subscription, order, billing attempt, activity or custom attributes payload. `idempotencyKey` is there for detecting duplicate deliveries. Recurly's only full example (for `subscriptions/created`) is a field map with placeholder values, so log real deliveries before relying on specific field types.

The Recurly Commerce API also lists `freeTrial/started` and `freeTrial/ended`, with no description or example.

## Delivery

- A delivery succeeds only on a `2xx` within 5 seconds; anything else is a failed delivery.
- Retries are not documented. Repeated failures never disable a webhook, so reconcile against the API after an outage.

## Full Event Reference

See [Recurly Commerce webhooks](https://docs.recurly.com/recurly-commerce/docs/webhooks) for topics, payload structure and delivery rules, the [Prive create-webhook reference](https://developers.tryprive.com/reference/publicapicontroller_createwebhook) for the topic list, and [Getting started with the Prive API](https://developers.tryprive.com/reference/getting-started-with-prive-api) for verification.
