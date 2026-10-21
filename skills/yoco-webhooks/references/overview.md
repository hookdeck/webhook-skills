# Yoco Webhooks Overview

## What Are Yoco Webhooks?

[Yoco](https://www.yoco.com) is a South African payments company (card machines, POS, and online payments). It sends an HTTPS `POST` with a JSON body to your endpoint when something happens in a Yoco account, so you don't have to poll the API.

Yoco has **two webhook systems**. Both are signed the same way ([Standard Webhooks](https://www.standardwebhooks.com/), see [verification.md](verification.md)), but they differ in how you subscribe, which events exist, and how the payload is shaped:

| | Yoco API | Checkout API |
|---|----------|--------------|
| Base URL | `https://api.yoco.com/v1` (sandbox: `https://api.yocosandbox.com`) | `https://payments.yoco.com/api` |
| Subscribe with | `POST /v1/webhooks/subscriptions/` | `POST /api/webhooks` |
| Event selection | Per subscription (`event_types` array) | None: all payment and refund events for the account |
| Event type field | `event_type` | `type` |
| Payload | Flat object of IDs (`business_id`, `order_id`, `payment_id`) | `{ id, type, createdDate, payload: {...} }` |
| Covers | POS and online payments, orders, catalogue items | Hosted checkout payments and refunds |

## Common Event Types

### Yoco API (`event_type`)

This is the complete list of values the create-subscription endpoint accepts.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `payment.created` | A payment is created | Mark an order paid, send a receipt |
| `payment.refunded` | A payment is refunded | Update accounting, notify support |
| `order.created` | A new order is opened | Start fulfilment or kitchen tickets |
| `order.updated` | Line items are added, changed, or voided; or the order is saved or transferred | Sync order contents |
| `order.completed` | An order is closed (fully paid) | Fulfil, close out in your system |
| `order.cancelled` | An order is cancelled | Release stock, cancel fulfilment |
| `item.created` | A catalogue item is created | Sync product catalogue |
| `item.updated` | A catalogue item is updated | Sync product catalogue |
| `item.deleted` | A catalogue item is deleted | Sync product catalogue |
| `item_category.created` | An item category is created | Sync categories |
| `item_category.updated` | An item category is updated | Sync categories |
| `item_category.deleted` | An item category is deleted | Sync categories |

Note the underscore in `item_category.*`. Payment and order events need the `business/orders:read` scope.

### Checkout API (`type`)

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `payment.succeeded` | A checkout payment succeeds | Fulfil the order for `payload.metadata.checkoutId` |
| `payment.failed` | A checkout payment fails | Let the customer retry |
| `refund.succeeded` | A full or partial refund succeeds | Update order and accounting |
| `refund.failed` | A refund fails (`payload.failureReason` explains why) | Alert support |

## Event Payload Structure

### Yoco API

```json
{
  "business_id": "f3f777bb-ca3c-4638-bc79-8fcf0fd0f8f1",
  "event_type": "payment.created",
  "order_id": "e13ed7f6-56a5-42f4-be6b-f87063ffd8f3",
  "payment_id": "d2ff5a9a-0998-46e2-aebe-2c72c3ddde1f"
}
```

The payload only carries IDs. Fetch the full object from the API if you need amounts or line items. `payment_id` appears on payment events; order events carry `order_id`.

### Checkout API

```json
{
  "id": "evt_...",
  "type": "payment.succeeded",
  "createdDate": "2026-10-21T08:00:00.000Z",
  "payload": {
    "id": "p_...",
    "type": "payment",
    "status": "succeeded",
    "mode": "live",
    "amount": 2900,
    "currency": "ZAR",
    "createdDate": "2026-10-21T08:00:00.000Z",
    "metadata": { "checkoutId": "ch_..." },
    "paymentMethodDetails": { "type": "card" }
  }
}
```

- `amount` is in cents; `currency` is currently always `ZAR`.
- `mode` is `live` or `test`. The same endpoint receives both.
- `paymentMethodDetails.type` is `card` or `instant_eft`; card payments add `card.maskedCard`, `card.scheme`, and expiry fields.
- Refund payloads add `refundableAmount`, and failed refunds add `failureReason`.
- The Checkout API sends **every** payment on the account to your webhook. Compare `payload.metadata.checkoutId` with the checkout ID you created before acting on it.

## Delivery Behaviour

- Respond with a `2xx` within **15 seconds**, or the attempt counts as failed.
- Retries: immediately, then after 5 s, 5 min, 30 min, 2 h, 5 h, 10 h, and 10 h. Each attempt gets a fresh `webhook-timestamp` and signature.
- If no delivery succeeds for **5 consecutive days**, the subscription is deactivated. Re-enable it via `PATCH` on the Yoco API subscription; for the Checkout API, register a new webhook.
- Events can arrive more than once and out of order. Deduplicate on the `webhook-id` header.
- Deliveries come from `52.215.16.239`, `54.216.8.72`, and `63.33.109.123` if you need a firewall allowlist. That's an extra layer, not a substitute for signature verification.

## Full Event Reference

- [Yoco API webhook events](https://developer.yoco.com/api-reference/yoco-api/webhook-events)
- [Checkout API webhook events](https://developer.yoco.com/api-reference/checkout-api/webhook-events)
- [Handling events (headers, retries, IPs)](https://developer.yoco.com/docs/api/webhooks/handling-events)
