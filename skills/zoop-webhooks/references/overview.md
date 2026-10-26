# Zoop Webhooks Overview

## What Are Zoop Webhooks?

When a resource changes state on the Zoop platform (a transaction is approved, a seller is
approved in the manual onboarding flow, a recurring subscription is charged), Zoop generates an
event and sends it to the webhooks you registered. Webhooks are also called HTTP callbacks.

Zoop's documentation is in Portuguese. Webhooks are **not signed**: the only authentication is
the `authorization` value you set when creating the webhook, returned in the `Authorization`
header (see [verification.md](verification.md)).

## What Does a Zoop Event Look Like?

```json
{
  "id": "{{event_id}}",
  "resource": "event",
  "type": "transaction.succeeded",
  "source": "API",
  "payload": { "object": { } },
  "uri": "/v1/marketplaces/{{marketplace_id}}/events/{{event_id}}",
  "created_at": "2015-06-17T20:12:25",
  "updated_at": "2015-06-18T07:45:02"
}
```

`payload.object` holds the resource in its final state after the action, so its shape varies
with `type`. `id` is the event id: use it to deduplicate.

## What Is the Ping Event?

When you create a webhook, Zoop first sends a validation event to check the URL is valid and
public. If your endpoint accepts it, the webhook status becomes `active`; otherwise it stays
`registred` (Zoop's spelling) and no events are delivered. If you see no ping within 5 minutes,
list webhooks for the marketplace and check `status`.

```json
{
  "id": "{{ping_id}}",
  "type": "ping",
  "resource": "event",
  "payload": { "object": { "ping": "true" } },
  "source": null,
  "name": null,
  "uri": "/v1/marketplaces/{{marketplace_id}}/events/{{event_id}}",
  "created_at": "2020-04-01T18:21:33+0000",
  "updated_at": "2020-04-01T18:21:33+0000"
}
```

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `ping` | A webhook is created | Activate the webhook: return `200` |
| `transaction.created` | A transaction is created | Track pending payments |
| `transaction.succeeded` | A transaction is approved | Fulfil the order |
| `transaction.failed` | A transaction fails | Notify the buyer, retry payment |
| `transaction.canceled` | A transaction is canceled | Release stock |
| `seller.activated` | A seller is activated | Enable payouts for the merchant |
| `bank_account.associated` | A bank account is associated | Mark payout details as ready |

Zoop also sends `transaction.*` variants (`charged_back`, `disputed`, `reversed`, ...),
`seller.*` (`created`, `enabled`, `denied`, ...), `invoice.*`, `subscription.*`, `plan.*` and
`transfer.*` events. Unknown types should get a `200` and be ignored.

## How Does Zoop Deliver Events?

- Delivery starts up to **5 minutes** after the event is generated and is guaranteed within
  10 minutes of the occurrence.
- Zoop waits **1 second** for a response. On timeout it closes the connection and retries after
  10 minutes.
- After **3 failed attempts** the event is marked `fail`. You can ask Zoop to replay failed
  events through the replay API; they stay available for **45 days**.
- Zoop recommends receiving and queuing events, processing later, and treating duplicate
  deliveries as one. Dedupe on the event `id`.

## Full Event Reference

- Webhooks: https://docs.zoop.co/docs/notifica%C3%A7%C3%B5es-e-eventos-webhook
- Event lists: https://docs.zoop.co/docs/eventos-de-webhook-1 (sellers, bank accounts),
  https://docs.zoop.co/docs/eventos-de-webhook-2 (transactions, invoices, subscriptions),
  https://docs.zoop.co/docs/eventos-de-webhook-3 (transfers)
