# Modem Pay Webhooks Overview

## What Are Modem Pay Webhooks?

Modem Pay is a payment gateway in The Gambia (mobile money, cards and payouts; its samples use `GMD`). Its webhooks "notify your server about key events, such as customer creation, payment intent updates, and successful charges." Modem Pay POSTs a JSON event to your HTTPS endpoint and signs it with `x-modem-signature`.

## Event Payload Structure

"The event type is provided in the event field, while the main data is within the payload." The sample from Modem Pay's docs, trimmed (customer details removed):

```json
{
  "event": "charge.succeeded",
  "payload": {
    "id": "23419194-7324-4c2b-a74b-d8fba736e692",
    "type": "payment",
    "amount": 2500,
    "currency": "GMD",
    "payment_method": "qmoney",
    "customer": "0f6e0912-2f2f-4d8b-bd68-ac8c97c44ae6",
    "metadata": {},
    "status": "completed",
    "payment_link_id": null,
    "business_id": "a10a51ae-05c8-406e-968c-7b1d309a77e0",
    "account_id": "7788dd90-3801-47a6-8597-b46eaa0a7d7d",
    "test_mode": true,
    "createdAt": "2024-12-15T09:34:17.036Z",
    "updatedAt": "2024-12-15T09:34:43.306Z",
    "payment_intent_id": "273ac751-369d-4198-8340-da480208bded",
    "transaction_reference": "VOAO1CFEN7",
    "payment_method_id": "4dbaaec5-7a16-4908-8fd9-c3d2bd24f739"
  }
}
```

The sample also carries customer contact details and `payment_metadata` (browser, device, IP address). Treat those as personal data: don't log them.

`payload` is only documented for `charge.succeeded`. For other events, check each field's type before you use it.

## Common Event Types

From Modem Pay's webhooks page ("Event Structure"):

| Group | Events |
|-------|--------|
| Customer | `customer.created`, `customer.updated`, `customer.deleted` |
| Payment intent | `payment_intent.created`, `payment_intent.cancelled`, `payment_intent.expired` |
| Charge | `charge.succeeded`, `charge.cancelled`, `charge.created`, `charge.updated`, `charge.expired` |
| Payout (transfer) | `transfer.succeeded`, `transfer.cancelled`, `transfer.reversed`, `transfer.failed`, `transfer.flagged` |

The Modem Pay CLI page lists `charge.failed` among the events `modempay trigger` can send, and the webhooks page doesn't. Handle it if you rely on failed charges, and acknowledge any event you don't recognise with a 200.

## Retries

"If your server fails to acknowledge a webhook event with a 200 OK HTTP response, Modem Pay will retry the delivery up to 3 times, with each retry spaced 10 minutes apart. A failure could be due to reasons such as server timeouts, network errors, or non-2xx response codes."

Modem Pay recommends answering 200 "immediately" and offloading slow work "to a background worker or job queue."

## What Isn't Documented

- An event or delivery ID. Deduplicate on `(event, payload.id)` instead (our suggestion).
- The request timeout, the source IP addresses, the `Content-Type` and any header other than `x-modem-signature`.
- Payload fields for events other than `charge.succeeded`.

## Full Event Reference

- [Modem Pay webhooks](https://docs.modempay.com/documentation/core/webhooks)
- [Webhook Tester (CLI)](https://docs.modempay.com/documentation/core/webhook-cli)
