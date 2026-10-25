# Agentcard Webhooks Overview

## What Are Agentcard Webhooks?

Agentcard issues virtual cards for AI agents. Everything that happens to your connected users reaches your server as a webhook: a card created, a charge authorized, a checkout approved. SDK callbacks are UI signals; webhooks are the record. Delivery is at least once, so deduplicate on the event `id`.

You register an endpoint with `POST https://api.agentcard.sh/api/v2/webhook_endpoints` (or in the dashboard under Developers → Webhooks) and list the events it should receive in `enabled_events`: exact names, prefix wildcards such as `card.*`, or `["*"]`. Endpoints are scoped to one mode: a sandbox token makes a sandbox endpoint (`livemode: false`), a production token a production one.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `card.created` | A one-time virtual card was created | Record the card id and starting balance |
| `card.updated` | The card's balance or status changed, e.g. after its first authorization | Keep card state in sync |
| `card.closed` | The card closed | Mark the card unusable |
| `transaction.authorized` | A merchant authorized a charge on the card | Track spend, match to an agent task |
| `approval.requested` | An action on a user's card needs their approval (e.g. another app asking to close it) | Show the user `action` and wait before `expires_at` |
| `checkout_authorization.approved` | The user approved a paused checkout with their passkey and the processor answered | Continue the purchase, reconcile `charged_amount` |
| `balance.low` | A card's remaining balance dropped below its threshold | Top up or alert |

Other events exist and the examples log them as unhandled: `transaction.cleared`, `transaction.declined`, `transaction.voided`, `connection.created`, `vault.*`, `order.*`, `identity.verification.updated`, other `checkout_authorization.*` (submitted, declined, expired, amount_mismatch, settled, settlement_unconfirmed, refused, watched), `reward.*`, `merchant.connected`, and company-wallet events.

## Event Payload Structure

Every event has the same envelope; branch on `type` directly (it is part of the API contract):

```json
{
  "id": "evt_9f8e7d6c5b4a",
  "type": "card.created",
  "created": 1757264400,
  "livemode": false,
  "data": { "id": "card_7h2k", "last4": "7318", "balance_cents": 1000, "status": "OPEN" }
}
```

`data` varies by event:

| Event | Notable `data` fields |
|-------|-----------------------|
| `card.created` / `card.updated` / `card.closed` | `id`, `last4`, `balance_cents`, `status` |
| `transaction.authorized` | `id`, `card_id`, `last4`, `amount`, `currency`, `amount_display`, `merchant`, `status`, `balance_cents` |
| `approval.requested` | `approval_id`, `action`, `card_id`, `last4`, `requested_by`, `expires_at`, `connection` |
| `checkout_authorization.approved` | `authorization_id`, `user_id`, `merchant`, `amount`, `currency`, `amount_display`, `psp`, `mode`, `charged_amount`, `charged_kind`, `settlement` |
| `balance.low` | `card_id`, `last4`, `balance_cents` |

## Delivery and Retries

Return a `2xx` quickly and do slow work afterwards. Failed deliveries retry up to five times: immediately, then after 1 minute, 5 minutes, 30 minutes and 1 hour. Each retry is a resend of the original request.

## Full Event Reference

See [Agentcard's webhook documentation](https://docs.agentcard.com/webhooks/overview) and the per-object pages linked from it (cards and transactions, checkout authorizations, connections, vault, orders, and more).
