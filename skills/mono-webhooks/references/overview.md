# Mono Webhooks Overview

## What Are Mono Webhooks?

Mono is an African open banking platform. Mono Connect (financial data) and DirectPay
(payments) notify your application with a `POST` to the webhook URL configured on your app.
All events share one payload format. Requests are not signed; each one carries a
`mono-webhook-secret` header holding your app's webhook secret so you can confirm it came from
Mono.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `mono.events.account_connected` | A user connects a financial account | Store the account id, start data retrieval |
| `mono.events.account_updated` | Account data is refreshed or its status changes | Sync balance, identity and transaction data |
| `mono.events.account_unlinked` | A connected account is unlinked from your app | Remove the stored account |
| `direct_debit.payment_successful` | A one-time DirectPay debit completes | Fulfil the order |
| `direct_debit.payment_failed` | A bank failure or network downtime after the user authorized the debit | Notify the customer, offer a retry |
| `direct_debit.payment_cancelled` | The user closes the DirectPay widget without authorizing | Release held stock |
| `direct_debit.payment_abandoned` | The user ignores the payment widget or the session times out | Expire the pending payment |

## Event Payload Structure

Every payload is a JSON object:

| Field | Description |
|-------|-------------|
| `event` | Event type from the table above (prefixed `mono.events.` or `direct_debit.`) |
| `event_id` | Identifier of the event. **Reused when Mono retries a delivery**, so dedupe on it |
| `timestamp` | ISO 8601 time the event was created |
| `data` | The event object; its shape depends on the event |

Example `mono.events.account_connected` payload (from the docs):

```json
{
  "event": "mono.events.account_connected",
  "event_id": "jU4ixom09P6eX2arBA3AmeiPyYalMk4WPdCaQ",
  "timestamp": "2026-01-27T21:00:39.588Z",
  "data": {
    "id": "6979274350b9c321c14524b1",
    "customer": "6961439d7716b67eba2d068a",
    "meta": { "data_status": "PROCESSING", "auth_method": "internet_banking", "ref": "4055877-T" },
    "app": "68cbf35e9DS6deec038a43d9",
    "business": "68ca76a195f6deec0384d6c0"
  }
}
```

`mono.events.account_updated` puts the account under `data.account` (with `data.meta`). The
`direct_debit.*` events put the payment under `data.object` (`id`, `status`, `amount`, `fee`,
`currency`, `reference`).

## Delivery and Retries

Return exactly `200 OK`. Any other response, or an unreachable URL, is retried with exponential
backoff for 48 hours. A status of `200` only acknowledges receipt; do slow work asynchronously.

## Full Event Reference

See Mono's [webhooks guide](https://docs.mono.co/docs/webhooks), the
[Financial Data events](https://docs.mono.co/docs/financial-data/webhook-introduction) and the
[DirectPay events](https://docs.mono.co/docs/payments/onetime/webhook-events).
