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

No topic header or body field is documented, so the request alone does not tell you which topic fired. Create one webhook per topic with a distinct endpoint path (or one Hookdeck connection per topic) and dispatch on the path. Check the payload shape per topic in the Prive API reference before relying on specific fields.

## Full Event Reference

See the [Prive create-webhook reference](https://developers.tryprive.com/reference/publicapicontroller_createwebhook) for the topic list, and [Getting started with the Prive API](https://developers.tryprive.com/reference/getting-started-with-prive-api) for verification.
