# Payroc Webhooks Overview

## What Are Payroc Webhooks?

Payroc (payment processor) calls them **event subscriptions**. You create a subscription through
the Payroc API, give it a notification URL and a secret, and Payroc sends a `POST` with a
CloudEvents 1.0 JSON body whenever a subscribed event happens.

Covers event subscriptions only, not Hosted Payments Page callbacks.

Requests are not signed. Each one carries the subscription's secret as plain text in the
`Payroc-Secret` header. That authenticates the sender, not the body, and gives no replay
protection (no signature, no timestamp).

## Common Event Types

| Event (`type`) | Triggered When | Common Use Cases |
|----------------|----------------|------------------|
| `processingAccount.status.changed` | A processing account's status changes (e.g. `entered`) | Track onboarding progress |
| `processingAccount.riskStatus.changed` | A processing account's risk status changes (e.g. `fullSuspense`) | Alert risk and support teams |
| `processingAccount.signature.signed` | A processing account's agreement is signed | Continue onboarding |
| `terminalOrder.status.changed` | A terminal order's status changes | Update fulfilment status |

## Event Payload Structure

Every body is a CloudEvent:

| Field | Meaning |
|-------|---------|
| `specversion` | `1.0` |
| `type` | The event type from the table above. Dispatch on this |
| `version` | Event schema version, e.g. `1.0.0` |
| `source` | `payroc` |
| `id` | Unique event id. Dedupe on this |
| `time` | When the event occurred (ISO 8601) |
| `datacontenttype` | `application/json` |
| `data` | Event-specific object |

Example `processingAccount.status.changed` (from the docs):

```json
{
  "specversion": "1.0",
  "type": "processingAccount.status.changed",
  "version": "1.0.0",
  "source": "payroc",
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "time": "2024-07-02T15:30:00.000Z",
  "datacontenttype": "application/json",
  "data": {
    "processingAccountId": "38765",
    "status": "entered"
  }
}
```

`processingAccount.riskStatus.changed` carries `data.riskStatus`; `processingAccount.signature.signed`
carries `data.signed` (the string `"true"`).

## Delivery

Respond with exactly `200`. Otherwise Payroc retries five times, then emails the subscription's
support address.

## Full Event Reference

See Payroc's [event subscription guide](https://docs.payroc.com/guides/events/create-event-subscription)
and its event pages under `docs.payroc.com/knowledge/events/`.
