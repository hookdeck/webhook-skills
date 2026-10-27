# Swipelux Webhooks Overview

## What Are Swipelux Webhooks?

[Swipelux](https://swipelux.com) is a stablecoin and fiat on/off-ramp, accounts and transfers
platform (API v3). It sends an HTTPS `POST` with a signed JSON payload to each endpoint you
register when something changes: a customer is created, a capability or application changes
status, an account is provisioned, a transfer moves to a new state. New integrations are delivered
by Svix and follow Standard Webhooks with the `svix-*` header names.

| Aspect | Value |
|--------|-------|
| Method | `POST`, JSON body (`application/json`) |
| Signature headers | `svix-id`, `svix-timestamp`, `svix-signature` (Standard Webhooks) |
| Success | Any `2xx` |
| Delivery | At least once; duplicates, delays and reordering are normal |
| Retries | Failed deliveries can be retried, and windows replayed, from the portal. No schedule or timeout is documented |

The `POST` method is Svix's statement (every operation in Swipelux's `webhooks` spec is a `post`);
Swipelux's prose doesn't state a method.

> **Only new integrations are supported.** Hookdeck's configuration alert for this source reads:
> "Only new Swipelux webhook integrations, delivered by Svix, are supported. Legacy integrations use a different scheme and fail verification."
> Legacy events are marked deprecated in the portal. Choose v3 event names for new subscriptions.

## Event Payload Structure

Every event arrives in the same v3 envelope:

```json
{
  "id": "evt_abc123",
  "type": "transfer.state_changed",
  "createdAt": "2026-07-04T12:00:00.000Z",
  "attempt": 1,
  "resource": { "type": "transfer", "id": "tr_abc123" },
  "data": {
    "object": {
      "id": "tr_abc123",
      "customerId": "cus_abc123",
      "state": "processing",
      "createdAt": "2026-07-04T12:00:00.000Z",
      "updatedAt": "2026-07-04T12:30:00.000Z"
    },
    "previous": { "state": "awaiting_funds" }
  }
}
```

- `id` is the event id. Put a uniqueness constraint on it to deduplicate.
- `type` is the event name. `resource.type` names the object kind (for example `transfer`), not the event.
- `attempt` is an envelope value, currently always `1` and unchanged by delivery retries. It is not a
  deduplication key or a retry counter.
- `resource.type` and `resource.id` locate the object. `data.object` is its state at the time of the event.
- `data.previous` holds the changed field (`{ "state": "..." }`) on `*.status_changed` and
  `transfer.state_changed` events. Other events omit it.

## Common Event Types

12 events are documented; the list may not be exhaustive.

| Event | Triggered When | Notable `data.object` fields |
|-------|----------------|------------------------------|
| `customer.created` | After a customer is created | `id`, `type` (e.g. `individual`), `externalId`, `changedSubresources` |
| `customer.updated` | A customer changes | same, `changedSubresources` lists what changed |
| `customer.archived` | A customer is archived | same plus `archivedAt` |
| `capability.created` | A capability is created | `id`, `customerId`, `method`, `accountType`, `status`, `statusReason`, `openTaskIds` |
| `capability.status_changed` | A capability's status changes after creation | same; `status` is `pending`, `ready`, `restricted`, `rejected` or `canceled` |
| `application.status_changed` | An institution application's status changes | `id`, `institution`, `status` (`requested`, `in_review`, `action_required`, `ready`, `rejected`, `disabled`, `canceled`), `statusReason` |
| `recipient.status_changed` | A recipient's status changes | `id`, `customerId`, `type`, `status` (`active`, `rejected`, `archived`) |
| `destination.status_changed` | A payout destination's status changes | `id`, `type`, `currency`, `status` (`in_review`, `ready`, `action_required`, `archived`), `details` |
| `account.created` | An account is created | `id`, `customerId`, `type`, `origin`, `status`, `currency`, `details` |
| `account.status_changed` | An account's status changes | same; `status` is `provisioning`, `in_review`, `ready`, `action_required`, `suspended`, `rejected` or `archived` |
| `account.details_changed` | An account's details change | same, with updated `details` and `routing` |
| `transfer.state_changed` | A v3 transfer changes public state | `id`, `customerId`, `state` (`awaiting_funds`, `processing`, `action_required`, `completed`, `failed`, `canceled`) |

The examples handle exactly these events and acknowledge anything else with `200`. Account,
capability, recipient, destination and application objects carry `status`; transfers carry `state`.

## Delivery Notes

- **Persist, acknowledge, then process.** Verify, store the verified envelope with a uniqueness
  constraint on `id`, return `2xx`, then process asynchronously.
- **Refetch current state.** Webhook order is not an authoritative history. Use `resource.type` and
  `resource.id` to fetch the object (for a transfer, `GET /v3/transfers/{transferId}`) and drive
  customer-visible status from the API response.
- A replay reuses the original event, so a completed event id stays a no-op.
- Acknowledge quickly so a slow dependency doesn't become a retry storm.

## Full Event Reference

See Swipelux's [webhook guide](https://docs.swipelux.com/integration/webhooks) and the
[transfer.state_changed reference](https://docs.swipelux.com/api-reference/webhooks/transfer-state-changed).
