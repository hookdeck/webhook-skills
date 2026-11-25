# Modem Pay Webhooks Overview

## What Are Modem Pay Webhooks?

Modem Pay is a payments API for The Gambia (mobile money, cards and payouts; its samples use `GMD`). A webhook is a `POST` request Modem Pay sends to your server when something happens, such as a payment succeeding, so you can mark orders paid even when the customer closes their browser. Each request is signed with `x-modem-signature`.

## Event Payload Structure

Every webhook has two fields: `event`, the name of what happened, and `payload`, the object it happened to. The sample from Modem Pay's docs, trimmed (customer contact fields removed):

```json
{
  "event": "charge.succeeded",
  "payload": {
    "id": "23419194-7324-4c2b-a74b-d8fba736e692",
    "type": "payment",
    "amount": 2500,
    "currency": "GMD",
    "status": "completed",
    "payment_method": "qmoney",
    "transaction_reference": "VOAO1CFEN7",
    "payment_intent_id": "273ac751-369d-4198-8340-da480208bded",
    "payment_link_id": null,
    "customer": "0f6e0912-2f2f-4d8b-bd68-ac8c97c44ae6",
    "metadata": { "order_id": "1042" },
    "custom_fields_values": {},
    "business_id": "a10a51ae-05c8-406e-968c-7b1d309a77e0",
    "account_id": "7788dd90-3801-47a6-8597-b46eaa0a7d7d",
    "test_mode": true,
    "createdAt": "2024-12-15T09:34:17.036Z",
    "updatedAt": "2024-12-15T09:34:43.306Z"
  }
}
```

The full sample also carries the customer's name, phone and email and a masked `payment_account`. Treat those as personal data: don't log them.

`payload` is only documented for `charge.succeeded`. For other events, check each field's type before you use it.

## Event Types

From Modem Pay's webhooks page:

| Group | Events |
|-------|--------|
| Payments | `charge.created`, `charge.succeeded`, `charge.failed`, `charge.cancelled`, `charge.refunded` |
| Payment intents | `payment_intent.created`, `payment_intent.cancelled`, `payment_intent.expired`, `payment_intent.restored` |
| Payouts | `transfer.succeeded`, `transfer.failed`, `transfer.reversed`, `transfer.flagged`, `transfer.queued`, `transfer.cancelled` |
| Customers | `customer.created`, `customer.updated`, `customer.deleted` |
| Invoices | `invoice.created`, `invoice.updated`, `invoice.deleted`, `invoice.overdue` (live mode only) |

Modem Pay's invoice pages also say a paid invoice triggers `paymentrequest.success`. The Node SDK's `EventType` union (modem-pay 2.0.1) adds `charge.updated`, which no docs page lists. Acknowledge any event you don't recognise with a 200.

## Retries

If your endpoint doesn't reply with a 2xx, or times out, Modem Pay tries again up to 3 more times, 10 minutes apart. Developers > Webhooks > Events lists every delivery with your server's response, and you can resend any event from there.

Modem Pay recommends replying `200` as soon as you've checked the signature and doing slow work afterwards.

## Webhooks and `callback_url`

A payment intent created with a `callback_url` sends that payment's events to that URL instead of your webhook. The body and retries are the same, but the signing key is different. See [verification.md](verification.md).

## What Isn't Documented

- An event or delivery ID. Modem Pay says `payload.id` stays the same across retries; deduplicate on `(event, payload.id, payload.updatedAt)` (our suggestion), because `payload.id` alone is shared by different events about the same object.
- The request timeout, the source IP addresses, the `Content-Type` and any header other than `x-modem-signature`.
- Delivery order.
- Payload fields for events other than `charge.succeeded`.

## Full Event Reference

- [Modem Pay webhooks](https://docs.modempay.com/documentation/core/webhooks)
- [Modem Pay CLI](https://docs.modempay.com/documentation/cli)
- [Callback URL](https://docs.modempay.com/documentation/payment-intents/callback_url)
