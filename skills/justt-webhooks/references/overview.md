# Justt Webhooks Overview

## What Are Justt Webhooks?

[Justt](https://www.justt.ai) is chargeback management and dispute automation for merchants. It sends an HTTP POST with a JSON body to every webhook endpoint you add in the Justt webhooks dashboard whenever something happens to a chargeback, a pre-chargeback alert or a CRM subscription it is cancelling. Deliveries follow the [Standard Webhooks](https://standardwebhooks.com/) specification and are signed with the endpoint's `whsec_` secret. The feature is not available to every Justt customer yet.

## Event Payload Structure

```json
{
  "type": "chargeback.created",
  "timestamp": "2022-03-15T09:39:24.514Z",
  "data": {
    "id": "04318fb0-e4ff-4712-972e-4db99b3fb23c",
    "chargebackId": "QRZ54SXB4K6TF232",
    "psp": "stripe",
    "currency": "USD",
    "amount": 100.17,
    "status": "waiting_for_data",
    "pspStatus": "needs_response",
    "reasonCode": "4855"
  }
}
```

| Field | Meaning |
|-------|---------|
| `type` | The event type, for example `chargeback.created`. This is what handlers switch on |
| `timestamp` | ISO 8601 time the event occurred |
| `data` | Event-specific object (see below) |

There is no event id in the body. The `webhook-id` header (`msg_...`) is unique per message and stable across retries, so it is the idempotency key.

### `data` by event family

| Events | Notable `data` fields |
|--------|-----------------------|
| `chargeback.created`, `chargeback.updated`, `chargeback.status.updated` | The full chargeback: `id`, `chargebackId`, `referenceAccountId`, `psp`, `currency`, `amount`, `status`, `pspStatus`, `lifecycleStage`, `reasonCode`, `reason`, `reasonGroup`, `cardScheme`, `dueDate`, `winProbability` and more |
| `chargeback.evidence.submitted` | `submitEvidenceId`, `fileId`, `id`, `chargebackId`, `status` (`succeeded` or `failed`), `submittedAt`, `error` |
| `chargeback.accepted` | `id`, `chargebackId`, `status` (`succeeded` or `failed`), `acceptedAt`, `error` |
| `pre_chargeback_alert.received`, `pre_chargeback_alert.transaction_matched` | `internalAlertId`, `provider` (CDRN, RDR or Ethoca), `providerAlertId`, `alertType`, `alertTimestamp`, `arn`, `transaction`; matched events add `matchedTransaction` |
| `pre_chargeback_alert.refund.succeeded`, `pre_chargeback_alert.refund.failed` | `internalAlertId`, `providerName`, `providerAlertId`, `psp` (`pspName`, `transactionId`, plus `refundId` / `refundedDate` or `refundError`), `amount`, `currency` |
| `subscription.cancel_immediately.success`, `subscription.cancel_immediately.failed` | `subscriptionId`, `transactionId`, `alertId`, `chargebackId`, `crmProvider`; failures add `failureCode` and `failureReason` |

The signature page's code sample uses a `ping` body with `event_type` instead of `type`. It is not one of the reference payloads.

## Common Event Types

The examples route these 11 documented events and log anything else:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `chargeback.created` | A new chargeback is received from any connected PSP | Open a case, alert the team |
| `chargeback.updated` | A chargeback is updated | Refresh your copy of the record |
| `chargeback.status.updated` | A chargeback status update is received | Track the dispute lifecycle |
| `chargeback.evidence.submitted` | Evidence is submitted to the PSP; `data.status` carries the outcome | Confirm the dispute response, retry on `failed` |
| `chargeback.accepted` | A chargeback acceptance is confirmed by the PSP; `data.status` carries the outcome | Write off the amount |
| `pre_chargeback_alert.received` | A pre-chargeback alert arrives from CDRN, RDR or Ethoca | Decide whether to refund |
| `pre_chargeback_alert.refund.succeeded` | The transaction linked to a refunded alert was refunded through the PSP | Close the alert |
| `pre_chargeback_alert.refund.failed` | A refund alert could not be processed | Refund manually |
| `pre_chargeback_alert.transaction_matched` | An inbound alert was matched to its transaction. Opt-in, enabled by Justt per account | Link the alert to your order |
| `subscription.cancel_immediately.success` | A CRM subscription (for example Chargebee or Recurly) was cancelled after a refund | Update entitlements |
| `subscription.cancel_immediately.failed` | The cancellation failed (subscription not found, already cancelled). Justt flags the alert as Action Required | Cancel by hand |

The docs call these the supported core event types, so the list may not be exhaustive. Ignore types you don't recognise.

## Delivery Behaviour

- **Acknowledge** with any `2xx` within 15 seconds (the reference spec says 30). Anything else is a failure.
- **Retries:** 4xx responses except `410`, 5xx responses, timeouts and connection failures are retried on an 8-attempt exponential schedule: immediately, then after 5 seconds, 5 minutes, 30 minutes, 2 hours, 5 hours, 10 hours and 10 hours (about 27.6 hours in all).
- **`410 Gone`** is a permanent failure: it is not retried.
- **Disabling:** an endpoint whose deliveries fail for 5 consecutive days is disabled until you re-enable it in the dashboard.
- **Recovery:** the dashboard can resend one message or recover failed messages since a date.
- **Duplicates:** the same event may arrive more than once; deduplicate on `webhook-id`.

## Full Event Reference

For the payload schema of every event, see [Justt's webhook documentation](https://developers.justt.ai/docs/webhook-introduction) and its [Webhook Events & Event Types](https://developers.justt.ai/docs/webhook-events-event-types) page.
