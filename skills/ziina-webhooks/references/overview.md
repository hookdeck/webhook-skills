# Ziina Webhooks Overview

## What Are Ziina Webhooks?

Ziina (ziina.com) is a UAE payments app with a payment API. Each account has one webhook URL, set with `POST /webhook` (`url`, optional `secret`). Ziina sends an HTTP POST with a JSON body to that URL whenever a payment intent or refund changes status. Setting the URL again overwrites the previous URL and secret.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `payment_intent.status.updated` | A payment intent changes status (the docs example shows `completed`) | Mark an order paid, release goods, record card details |
| `refund.status.updated` | A refund changes status | Update refund state in your system, notify the customer |

The event name does not change with the status. Read the new state from `data.status`. No header names the event; dispatch on the body's `event` field.

## Event Payload Structure

```json
{
  "event": "payment_intent.status.updated",
  "data": {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "account_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "amount": 1050,
    "tip_amount": 0,
    "vat_amount": 0,
    "currency_code": "AED",
    "created_at": "1712345678901",
    "status": "completed",
    "operation_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "settled": { "amount": 1050, "tip_amount": 0, "vat_amount": 0, "currency_code": "AED" },
    "card_details": { "card_last_four": "6789", "card_brand": "mastercard", "card_funding_type": "credit" }
  }
}
```

(`card_details` is trimmed here; the docs example also carries BIN, issuer, country and sub-brand.) Amounts are integers in minor units.

## Delivery

A non-OK response is retried 3 times. The docs give no timeout or spacing. Respond `200` quickly and make handlers idempotent (for example on `data.id` plus `data.status`).

## Full Event Reference

See [Ziina's webhook documentation](https://docs.ziina.com/api-reference/webhook/index).
