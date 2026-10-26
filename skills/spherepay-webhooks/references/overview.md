# SpherePay Webhooks Overview

## What Are SpherePay Webhooks?

SpherePay (spherepay.co) is a stablecoin on- and off-ramp payments API. Its v2 webhooks notify your application when a customer's verification profile or a transfer changes status, so you don't have to poll the `GET` endpoints. You register an HTTPS endpoint with `POST /v2/webhook-endpoints`, choose the events (or wildcards `*`, `customer.*`, `transfer.*`), and SpherePay sends a signed JSON `POST` to the endpoint for each matching event.

## Delivery Semantics

- **One attempt, no automatic retries.** A non-2xx response, a redirect, or no response within **15 seconds** marks the delivery `failed`. It can only be replayed manually through the Events API. Failures never disable the endpoint.
- **At-least-once.** Deduplicate on the body's `id` (stable across every delivery and replay).
- **Unordered.** Use the body's `sequence` to discard stale updates.
- **Minimal payloads.** The body carries the state transition (`previousStatus` to `status`), not the whole resource; call the resource's `GET` endpoint for the rest.
- Acknowledge with a 2xx right after verifying the signature and do heavy work asynchronously.

## Common Event Types

The event name is the `type` field of the JSON body.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `customer.created` | `POST /v2/customer` succeeds (`previousStatus` is `null`, `status` is `incomplete`) | Track new customers |
| `customer.pending` | All required criteria items resolve for a verification profile | Show "under review" |
| `customer.approved` | SpherePay approves the verification profile | Enable the customer to transact |
| `customer.rejected` | SpherePay rejects the verification profile | Notify the customer, block transfers |
| `transfer.created` | `POST /v2/transfer` succeeds | Record the transfer |
| `transfer.pendingFunding` | The transfer returned to `pendingFunding` (for example after `pendingReview`) | Prompt the customer to fund |
| `transfer.pendingReview` | The transfer entered compliance review | Show "in review" |
| `transfer.fundsReceived` | SpherePay detected funds from the customer | Confirm funding |
| `transfer.processing` | Processing started | Update progress |
| `transfer.succeeded` | Terminal success: funds delivered | Mark complete, notify |
| `transfer.returned` | The destination bank returned the transfer | Reconcile, alert |
| `transfer.pendingRefundInformation` | SpherePay needs information from the customer to complete a refund | Ask for refund details |
| `transfer.refunded` | The refund was delivered to the customer | Mark refunded |
| `transfer.failed` | Terminal failure | Alert, retry with a new transfer |
| `transfer.canceled` | The customer canceled before funding | Close out |
| `transfer.expired` | The transfer expired before funding | Close out |
| `transfer.failedPrecondition` | Customer-provided information failed a precondition check | Ask for corrections |
| `transfer.unexpectedError` | An unexpected error occurred during processing | Alert, contact support |

The examples in this skill handle `customer.created/pending/approved/rejected` and `transfer.created/pendingFunding/pendingReview/fundsReceived/processing/succeeded/returned/refunded/failed`, and log everything else.

## Event Payload Structure

```json
{
  "id": "event_01HXPA3M9R7DEF456",
  "type": "transfer.succeeded",
  "apiVersion": "v2",
  "originalCreateDate": "2026-08-07T14:05:30.000Z",
  "livemode": true,
  "sequence": 5,
  "data": {
    "id": "payout_d243ab2b1de4447d8a046d87fefe58cf",
    "type": "transfer",
    "applicationId": "application_1324354657",
    "customerId": "customer_f31121c389624d3697cbf3ea8830b7a4",
    "transferType": "oneTimeTransfer",
    "previousStatus": "processing",
    "previousStatusAt": "2026-08-07T14:02:15.000Z",
    "status": "succeeded",
    "statusAt": "2026-08-07T14:05:30.000Z"
  }
}
```

- `id`: event ID (idempotency key); `sequence`: orders events for a resource; `livemode`: `false` for test-mode events.
- Customer events carry `verificationProfile` in `data` (one event stream per profile). Transfer events use the `payout_` ID prefix in `data.id`.
- Delivery-specific values (`Sphere-Delivery-Id`, `Sphere-Delivery-Attempt`, `Sphere-Delivery-Type`, timestamp, signature) are HTTP headers, not part of the body.

## Full Event Reference

For the complete list of events, see [SpherePay's event catalog](https://docs.spherepay.co/concepts/webhooks/event-catalog) and [webhooks overview](https://docs.spherepay.co/concepts/webhooks/overview).
