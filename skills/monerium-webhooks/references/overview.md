# Monerium Webhooks Overview

## What Are Monerium Webhooks?

[Monerium](https://monerium.com) is an electronic money institution that issues euro e-money tokens on-chain, with IBANs linked to blockchain addresses. Orders move money between IBANs and wallets: an incoming SEPA payment creates an `issue` order that mints EURe, and an outgoing payment or cross-chain transfer is a `redeem` order. Order processing is asynchronous, so Monerium sends an HTTP POST with a JSON body to every webhook you register (see the [Private integration guide](https://docs.monerium.com/private)). Deliveries follow the [Standard Webhooks](https://standardwebhooks.com/) specification and are signed with the secret you supplied at registration.

Profile approval is notified by email, not by webhook.

## Event Payload Structure

Every body is `{ type, data }`. The guide prints no payload example; these fields are inferred from its handler code:

```json
{
  "type": "order.updated",
  "data": {
    "id": "<order id>",
    "state": "processed",
    "meta": { "txHashes": ["0x..."] }
  }
}
```

| Field | Meaning |
|-------|---------|
| `type` | The event type, for example `order.updated`. This is what handlers switch on |
| `data.id` | The order id (not an event id) |
| `data.state` | The order state. The guide acts on `processed` and `rejected` |
| `data.meta` | `txHashes` (on-chain transaction hashes) once processed; `rejectedReason` when rejected |

`order.created` data is read for `kind` (`issue` for an incoming payment), `amount`, `currency`, `chain` and `counterpart`.

The `webhook-id` header is unique per message and stable across retries, so it is the idempotency key.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `order.created` | An order is created, e.g. an incoming payment is detected before it is processed | Notify the customer early that funds are on the way |
| `order.updated` | An order changes state | Mark payments complete on `processed` (read `meta.txHashes`), handle `rejected` (read `meta.rejectedReason`) |
| `subscription.created` | Immediately after you register the webhook | Answer `200 OK` to activate the subscription |

The guide lists these three and does not claim the list is exhaustive: acknowledge types you don't recognise with `200`. To react to an order the moment it is detected, subscribe to `order.created` as well as `order.updated`, which the guide calls the primary event.

## Full Event Reference

See the [Private integration guide](https://docs.monerium.com/private) and the API reference linked from it.
