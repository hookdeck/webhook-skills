# Qonto Webhooks Overview

## What Are Qonto Webhooks?

Qonto (qonto.com) is a European business bank. Its Business API can push events to your server instead of you polling. You create a webhook subscription with `POST /v2/webhook_subscriptions`, giving a `callback_url` and one or more `types` (for example `v1/transactions`, `v1/cards`). Qonto then sends a `POST` to the `callback_url` for each new matching event, signed with the subscription's secret in the `X-Qonto-Signature` header.

Events that happened before you subscribed are not sent; use the HTTP endpoints to backfill.

## Common Event Types

The top-level `type` is the **subscription type**; `data.event` says what happened to the resource.

| `type` | `data.event` examples (from the docs' sample payloads) | Common use cases |
|--------|--------------------------------------------------------|------------------|
| `v1/transactions` | `created` | Reconcile bank transactions, update bookkeeping |
| `v1/cards` | `created` | Track card issuance and status |
| `v1/transfers` | `created` | Track SEPA transfer status |
| `v1/accounts` | `created` | Bank account changes |
| `v1/memberships` | `updated` | Team member changes |
| `v1/organizations` | `suspended` | Organization status |
| `v1/payment-links` | `created` | Payment link lifecycle |
| `v1/payment-links-connections` | `connection_enabled` | Payment link connections |
| `v1/terminal-payments` | `authorized` | Terminal payments |
| `v1/sepa-direct-debit-collections` | `completed` | Direct debit collections |
| `v1/recurring-transfers`, `v1/beneficiaries`, `v1/clients`, `v1/products`, `v1/client-invoices`, `v1/consent-revocations` | see the docs | Other resources |

The "Supported events" lists on Qonto's type pages are not consistent: transactions, cards, memberships, organizations and payment-links list prefixed names (`transactions.created`, `cards.locked`), while their own examples carry the bare value (`"event": "created"`). The bare form is what every example shows. Log values you don't recognise instead of failing.

## Event Payload Structure

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "subscription_id": "123e4567-e89b-12d3-a456-426614174000",
  "organization_id": "123e4567-e89b-12d3-a456-426614174000",
  "membership_id": "123e4567-e89b-12d3-a456-426614174000",
  "type": "v1/transactions",
  "created_at": "2025-01-24T10:55:00Z",
  "data": {
    "event": "created",
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "amount": 50.01,
    "currency": "EUR",
    "side": "debit",
    "status": "completed"
  }
}
```

(`data` is trimmed here; each type has its own fields.)

## Delivery and Retries

- Your endpoint must return a 2xx within **1 second**; slower is a failure.
- Failed deliveries are retried with exponential backoff for a few days until acknowledged, so the same event can arrive more than once. Make handlers idempotent.
- Store the webhook in a queue and process it asynchronously, as the examples do.

## Full Event Reference

See [Qonto's webhook setup page](https://docs.qonto.com/api-reference/business-api/webhooks/setup) and the per-type pages under `/webhooks/supported-webhooks/` (for example [v1/transactions](https://docs.qonto.com/api-reference/business-api/webhooks/supported-webhooks/v1-transactions)).
