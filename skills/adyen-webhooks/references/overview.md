# Adyen Webhooks Overview

## What Are Adyen Webhooks?

Adyen is an enterprise payments platform. It uses **webhooks** (called
**notifications** in Adyen's terminology) to push event-driven messages to your
server via HTTP POST — for example, when a payment is authorised, captured,
refunded, or charged back.

The most common type is the **standard notification**. Adyen delivers a JSON body
containing a batch of `notificationItems`. For JSON/HTTP POST webhooks each batch
contains a single item, but your handler should always iterate the array.

Because many payment flows are asynchronous (the shopper's bank confirms later, a
capture settles hours later, a chargeback arrives days later), webhooks are the
**authoritative** source of truth for payment state — not the synchronous API
response you got at checkout.

## Webhook Payload Structure

```json
{
  "live": "false",
  "notificationItems": [
    {
      "NotificationRequestItem": {
        "eventCode": "AUTHORISATION",
        "success": "true",
        "eventDate": "2024-01-01T01:00:00+01:00",
        "merchantAccountCode": "TestMerchant",
        "pspReference": "7914073381342284",
        "originalReference": "",
        "merchantReference": "TestPayment-1407325143704",
        "amount": { "value": 1130, "currency": "EUR" },
        "paymentMethod": "visa",
        "reason": "033899:1130:12/2012",
        "additionalData": {
          "hmacSignature": "coqCmt/IZ4E3CzPvMY8zTjQVL5hYJUiBRg8UU+iCWo0="
        }
      }
    }
  ]
}
```

### Key Fields (`NotificationRequestItem`)

| Field | Description |
|-------|-------------|
| `eventCode` | The event type (see below). |
| `success` | `"true"` or `"false"` — **the outcome of the event**. Always check this. |
| `pspReference` | Adyen's unique reference for this transaction/modification. |
| `originalReference` | The `pspReference` of the original payment (for captures, refunds, cancellations). Empty for the original authorisation. |
| `merchantAccountCode` | The merchant account that received the payment. |
| `merchantReference` | Your own reference passed at payment time. |
| `amount` | `{ "value": <minor units>, "currency": "<ISO code>" }`. `value` is in minor units (e.g. `1130` = €11.30). |
| `eventDate` | ISO 8601 timestamp of the event. |
| `reason` | Human-readable reason (refusal reason, failure detail, etc.). |
| `additionalData` | Extra data, including `hmacSignature` used for verification. |

> **`success` is not "did the webhook arrive" — it's the business outcome.** An
> `AUTHORISATION` with `success: "false"` is a **refused** payment. Handle it
> accordingly.

## Common Event Types

| `eventCode` | Triggered When | Common Use Cases |
|-------------|----------------|------------------|
| `AUTHORISATION` | A payment is authorised (or refused — check `success`). | Fulfil orders, mark payment received. |
| `CAPTURE` | Previously authorised funds are captured. | Confirm settlement, release goods. |
| `CAPTURE_FAILED` | A capture attempt fails. | Retry capture, alert operations. |
| `REFUND` | A refund is processed. | Update order/refund status. |
| `REFUND_FAILED` | A refund attempt fails. | Alert support, retry refund. |
| `CANCELLATION` | An authorisation is cancelled. | Release held inventory. |
| `CANCEL_OR_REFUND` | A payment is cancelled or refunded (captured → refund, uncaptured → cancel). | Reverse fulfilment. |
| `CHARGEBACK` | Funds are reversed by the shopper's bank. | Revoke access, update accounting. |
| `NOTIFICATION_OF_CHARGEBACK` | A dispute is opened. | Gather evidence to defend. |
| `REPORT_AVAILABLE` | A generated report is ready to download. | Download reconciliation reports. |

## Expected Response

Your endpoint must return HTTP **200** with the literal response body:

```
[accepted]
```

Adyen expects `[accepted]` to acknowledge receipt. **Return it even for events you
don't handle** — as long as the webhook is authentic. If Adyen does not receive
`[accepted]`, it queues the notification and retries later. Do **not** perform slow
work before responding; acknowledge first, process asynchronously.

## Full Event Reference

For the complete list of event codes and payloads, see the
[Adyen webhook types documentation](https://docs.adyen.com/development-resources/webhooks/webhook-types).
