# Paymob Webhooks Overview

## What Are Paymob Webhooks?

Paymob calls its webhooks **callbacks**. Paymob sends a transaction callback
when a transaction succeeds or is declined, and again after an action on it
(refund, void, capture). When a customer saves a card, the same URL also gets a
card token callback. Every callback carries an `hmac` query parameter you must
verify (see [verification.md](verification.md)) before trusting the payload.

| Callback | Method | Body / params | Purpose |
|----------|--------|---------------|---------|
| **Transaction Processed Callback** | POST (server-to-server) | JSON `{ "type": "TRANSACTION", "obj": { … } }` | The notification your backend should act on |
| **Card token callback** | POST (same URL) | JSON `{ "type": "TOKEN", "obj": { … } }` | A customer saved a card; `obj.token` is the token |
| **Transaction Response Callback** | GET (browser redirect) | Query parameters | Redirects the customer back to your site after payment |

Build your handler on the POST URL: the integration ID's **Webhook URL**, or the
`notification_url` you pass when you create an intention. Paymob says not to
update order status from the GET redirect, because the customer may never
complete it.

Subscriptions use their own callback, sent to a webhook you register on each
subscription, with a `trigger_type` field and `hmac` in the body.

## No Event Names for Outcomes

`type` tells a card token from a transaction, but a transaction's outcome has
no event name. Read the booleans on `obj`:

| Fields | Transaction state | Common use case |
|--------|-------------------|-----------------|
| `success: true` | **Succeeded** | Fulfil the order, mark paid |
| `success: false`, `pending: false` | **Declined** | Notify customer, release cart |
| `success: false`, `pending: true` | **Pending** | OTP page, kiosk reference or cash collection |
| `success: true`, `is_auth: true`, `is_capture: false` | **Authorized** | Funds held; capture later |
| `is_captured: true` | **Captured** | `captured_amount` totals partial captures |
| `is_refunded: true` | **Refunded** | `refunded_amount_cents` totals partial refunds |
| `is_voided: true` | **Voided** | Cancel an uncaptured authorization |

Use `obj.order.id` (Paymob's order ID) to find the order on your side.

## Payload Structure

Transaction Processed Callback (POST) body, abridged to the signed fields, with
values from Paymob's HMAC transaction callback example:

```json
{
  "type": "TRANSACTION",
  "obj": {
    "id": 192036465,
    "pending": false,
    "amount_cents": 100000,
    "success": true,
    "is_auth": false,
    "is_capture": false,
    "is_standalone_payment": true,
    "is_voided": false,
    "is_refunded": false,
    "is_3d_secure": true,
    "integration_id": 4097558,
    "has_parent_transaction": false,
    "order": { "id": 217503754 },
    "created_at": "2024-06-13T11:33:44.592345",
    "currency": "EGP",
    "source_data": { "pan": "2346", "type": "card", "sub_type": "MasterCard" },
    "error_occured": false,
    "owner": 302852
  }
}
```

The full example also carries `order` details, `data`, `payment_key_claims`,
`is_captured`, `captured_amount`, `refunded_amount_cents` and `updated_at`.

Card token callback, abridged to the signed fields:

```json
{
  "type": "TOKEN",
  "obj": {
    "id": 17233884,
    "token": "<card token>",
    "masked_pan": "xxxx-xxxx-xxxx-2346",
    "merchant_id": 164295,
    "card_subtype": "MasterCard",
    "created_at": "2026-11-16T10:44:52.523591",
    "email": "example.test@example.com",
    "order_id": "655608785"
  }
}
```

## Delivery

Paymob documents no timeout, retry schedule or ordering for callbacks. It names
the Transaction Inquiry APIs (by transaction ID, order ID or merchant order ID)
as the fallback when a callback is missed, and the Card Token Inquiry API
returns a saved token by order ID.

## Full Event Reference

- [Webhook (Callbacks) & HMAC](https://developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac)
- [Transaction callbacks](https://developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac/transaction-callbacks)
- [HMAC transaction callback](https://developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac/hmac/hmac-transaction-callback)
- [HMAC for card tokens](https://developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac/hmac/hmac-for-card-tokens)
- [Subscription callback HMAC](https://developers.paymob.com/paymob-docs/hmac-calculation-for-subscription-callback)
