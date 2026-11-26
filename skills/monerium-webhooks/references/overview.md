# Monerium Webhooks Overview

## What Are Monerium Webhooks?

[Monerium](https://monerium.com) is an electronic money institution that issues euro e-money tokens on-chain, with IBANs linked to blockchain addresses. Orders move money between IBANs and wallets: an incoming SEPA payment creates an `issue` order that mints EURe, and an outgoing payment or cross-chain transfer is a `redeem` order. Order processing is asynchronous, so Monerium sends an HTTP POST with a JSON body to every webhook you register (see the [Private](https://docs.monerium.com/private) and [Whitelabel](https://docs.monerium.com/whitelabel) guides). Deliveries follow the [Standard Webhooks](https://standardwebhooks.com/) specification and are signed with the secret you supplied at registration.

On the Private plan, profile approval is notified by email, not by webhook. Whitelabel integrations receive `profile.updated` for their customers' profiles.

## Event Payload Structure

Every body has `type`, `timestamp` (RFC 3339) and, except on `subscription.created`, `data`. The [API reference](https://docs.monerium.com/api/#tag/webhooks) prints this `profile.error` example:

```json
{
  "type": "profile.error",
  "timestamp": "2024-08-09T12:44:04.777884Z",
  "data": {
    "id": "4f079ef8-6d26-11eb-9bc8-acde48001122",
    "kind": "personal",
    "errors": [
      {
        "field": "address",
        "reason": "address exceeds 70 characters"
      }
    ]
  }
}
```

For order events, `data` is the Order object. The reference prints no example body for them; the guides' handlers read these fields:

| Field | Meaning |
|-------|---------|
| `type` | The event type, for example `order.updated`. This is what handlers switch on |
| `data.id` | The order id (not an event id) |
| `data.state` | The order state. The guide acts on `processed` and `rejected` |
| `data.meta` | `txHashes` (on-chain transaction hashes) once processed; `rejectedReason` when rejected |

`order.created` data is read for `kind` (`issue` for an incoming payment), `amount`, `currency`, `chain` and `counterpart`.

The `webhook-id` header is unique per message and Monerium's docs say retries carry the same value, so it is the idempotency key.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `order.created` | An order is created, e.g. an incoming payment is detected before it is processed | Notify the customer early that funds are on the way |
| `order.updated` | An order changes state | Mark payments complete on `processed` (read `meta.txHashes`), handle `rejected` (read `meta.rejectedReason`) |
| `profile.updated` | A profile's state changes | Whitelabel onboarding: proceed on `approved`, collect source of funds on `incomplete` |
| `profile.error` | KYC profile data was rejected as invalid and skipped (opt-in) | Correct the listed fields and resubmit |
| `iban.updated` | An IBAN's details or state change | Store the assigned IBAN and show it to the customer |
| `subscription.created` | Immediately after you create or update the webhook | Answer `200 OK`, or the subscription isn't created |

When `types` is omitted, `iban.updated` and `profile.updated` are subscribed by default; `profile.error` is opt-in. Acknowledge types you don't recognise with `200`. To react to an order the moment it is detected, subscribe to `order.created` as well as `order.updated`, which the guide calls the primary event.

## Full Event Reference

See the [API reference's webhooks section](https://docs.monerium.com/api/#tag/webhooks), the [Private guide](https://docs.monerium.com/private) and the [Whitelabel guide](https://docs.monerium.com/whitelabel).
