# Xendit Webhooks Overview

## What Are Xendit Webhooks?

Xendit sends an HTTP `POST` to the URL you save in the dashboard whenever something happens asynchronously: a customer pays, a payment fails, a token is activated, a refund completes, an invoice expires. Local payment methods (e-wallets, virtual accounts, QR codes) can take minutes to days to confirm, so webhooks are how you learn the outcome.

Things that differ from most providers:

- **No signature.** Nothing is hashed or signed. Xendit sends your webhook verification token in the `x-callback-token` header and you compare it with your stored copy. See [verification.md](verification.md).
- **Payload shape varies by product.** Payments API webhooks have an `event` field; legacy invoice callbacks don't.
- **Per-product URLs.** The dashboard lets you set a callback URL per product (invoices, virtual accounts, e-wallets, payouts and so on), all sharing one verification token.

## Retries and Delivery

A delivery succeeds when your server returns a `2xx`. Otherwise Xendit retries up to six times with exponential backoff: after 15m, 1h, 3h, 6h, 12h and 24h (relative to the original attempt). You can also resend an event from the dashboard's Webhook tab (needs the Developer permission). Webhooks can arrive duplicated or out of order, so key your processing on `payment_id` / `capture_id` and don't assume a sequence. Acknowledge quickly and do heavy work afterwards.

## Common Event Types (Payments API)

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `payment.capture` | Payment collected and confirmed | Fulfil the order |
| `payment.authorization` | Payment reserved on the customer's account | Capture or hold |
| `payment.failure` | Payment failed to be collected | Release stock, notify the customer |
| `payment.expiry` | A successful authorization expired | Release reserved funds |
| `payment_request.expiry` | Payment request expired unpaid | Cancel the pending order |
| `payment_token.activation` | Payment token authenticated and confirmed | Store the token for later charges |
| `payment_token.failure` | Payment token authentication failed | Ask the customer to retry |
| `payment_token.expiry` | Payment token reached its expiry | Remove the stored token |
| `refund.succeeded` | Refund confirmed | Mark the refund done |
| `refund.failed` | Refund failed | Alert support |

## Payload Structure

Payments API webhooks:

```json
{
  "event": "payment.capture",
  "business_id": "603f1c4172bbe840979fd408",
  "created": "2026-08-26T07:28:23.731Z",
  "data": {
    "payment_id": "py-66269236-7447-450f-b0d8-ed4255b11d8a",
    "payment_request_id": "pr-c5a38204-58a9-4968-a8ad-68a79b172a66",
    "reference_id": "nw-2026-08-26T07:28:23.260Z",
    "currency": "IDR",
    "request_amount": 1234,
    "channel_code": "DANA",
    "status": "SUCCEEDED",
    "captures": [{ "capture_id": "cptr-66269236-...", "capture_amount": 1234 }]
  }
}
```

Invoice callbacks have no `event`. The invoice is the body and `status` (for example `PAID` or `EXPIRED`) tells you the outcome; match it to your order with `external_id`. Payload fields for invoices and the older per-product callbacks (virtual accounts, e-wallets, payouts) differ, so check the product's page in the docs before relying on a field.

## Other Products

Payouts, Subscriptions, Disputes, Reports, xenPlatform account events and Payment Sessions each have their own webhook page. Bill Payments callbacks (`bill_payment.succeeded`, `bill_payment.failed`) are signed with `X-Callback-Signature` (HMAC SHA256) and `X-Callback-Timestamp` instead of `x-callback-token`.

## Full Event Reference

- [Handling webhooks](https://docs.xendit.co/docs/handling-webhooks)
- [Payments API webhooks](https://docs.xendit.co/docs/payments-api-webhooks) (event list)
- [Webhook behavior](https://docs.xendit.co/apidocs/webhook-behavior) (retries)
- [Payment webhook notification](https://docs.xendit.co/apidocs/payment-webhook-notification) (payload examples)
