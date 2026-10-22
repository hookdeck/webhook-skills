# Paysafe Webhooks Overview

## What Are Paysafe Webhooks?

Paysafe's Payments API sends asynchronous POST requests with a JSON payload to a URL you configure in the Business Portal whenever a resource changes state. Payloads are minimal and include links to the API resource, so fetch the resource for full details. Paysafe strongly recommends webhooks for redirect-flow payment methods such as Skrill, Paysafecard, PaysafeCash, iACH, PayPal, Interac, VIP Preferred, and Play+ (Sightline).

If your endpoint returns a 4xx or 5xx response, Paysafe retries the webhook up to three times.

## Common Event Types

| Event (`eventName`) | Triggered When | Common Use Cases |
|---------------------|----------------|------------------|
| `PAYMENT_HANDLE_INITIATED` | Handle request received, awaiting processor | Tracking |
| `PAYMENT_HANDLE_PROCESSING` | Handle is waiting for authentication | Tracking |
| `PAYMENT_HANDLE_PAYABLE` | Handle can be used for a payment call | Create the payment |
| `PAYMENT_HANDLE_COMPLETED` | Payment associated with the handle initiated | Redirect-flow completion |
| `PAYMENT_HANDLE_FAILED` | Handle failed or declined | Ask for another method |
| `PAYMENT_COMPLETED` | Payment completed | Fulfil order |
| `PAYMENT_FAILED` | Payment failed or declined | Notify customer |
| `PAYMENT_CANCELLED` | Payment fully voided | Release inventory |
| `PAYMENT_HELD` | Payment held for risk review | Hold fulfilment |
| `SETTLEMENT_COMPLETED` | Settlement completed | Reconciliation |
| `SETTLEMENT_FAILED` | Settlement failed or declined | Alert finance |

Also available: `PAYMENT_PROCESSING`, `PAYMENT_RECEIVED`, `SETTLEMENT_RECEIVED`, `SETTLEMENT_PENDING`, `SETTLEMENT_PROCESSING`, `SETTLEMENT_CANCELLED`, `VOIDAUTH_*`, and event categories for registration, refunds, original credits, standalone credits and payment scheduler.

## Event Payload Structure

```json
{
  "payload": { "id": "a49ba790-...", "status": "COMPLETED", "paymentType": "CARD" },
  "attemptNumber": 1,
  "type": "PAYMENT_HANDLE",
  "resourceId": "a49ba790-...",
  "links": [{ "rel": "payment_handle", "href": "https://api.paysafe.com/paymenthub/v1/paymenthandles/a49ba790-..." }],
  "eventDate": "2026-01-15T10:00:00Z",
  "eventName": "PAYMENT_HANDLE_COMPLETED"
}
```

Paysafe's documentation example shows the resource body (`id`, `status`, `type`, `paymentType`, ...) rather than this envelope; handle both defensively and dispatch on `eventName` when present.

## Full Event Reference

See [Paysafe webhook events](https://developer.paysafe.com/en/api-docs/paysafe-checkout/webhook-events/) and [Configure webhooks](https://developer.paysafe.com/en/api-docs/payments-api/configure-webhooks/).
