# Fireblocks Webhooks Overview

## What Are Fireblocks Webhooks?

[Fireblocks](https://developers.fireblocks.com/) is a digital-asset custody, transfer, and settlement platform. Webhooks let your backend react to on-chain and workspace activity — transactions being created, changing status, completing on-chain, or requiring approval — without polling the API.

This skill targets **Webhooks v2**, the current scheme. Each notification is a signed HTTP `POST` with a JSON body. You verify the `Fireblocks-Webhook-Signature` header (a detached JWS, RS512) and then process the event.

Webhooks v2 adds:

- **Event subscriptions** — subscribe only to the categories or specific event types you need.
- **Resend** — programmatically resend notifications for up to **30 days** after the original event.
- **JWKS-based signatures** — auto-rotated public keys served from regional JWKS endpoints (no static key to manage).

## Event Payload Structure

Every v2 notification shares the same top-level envelope; only `data` varies per event type:

```json
{
  "id": "6f8a...",                       // UUID of this notification
  "resourceId": "abc123",                // optional — ID of the entity (e.g. txId)
  "webhookId": "9c1d...",                // UUID of the webhook config
  "workspaceId": "1a2b...",              // UUID of your workspace
  "eventType": "transaction.created",    // dotted lowercase event name
  "createdAt": 1754494189479,            // epoch milliseconds
  "data": { }                            // event-specific resource (e.g. TransactionDetails)
}
```

Dispatch on `eventType`; read the resource from `data`.

## Common Event Types

Event names are **dotted lowercase** in v2 (e.g. `transaction.created`). The legacy v1 scheme used uppercase names (e.g. `TRANSACTION_CREATED`); if you see those, you are on the deprecated v1 path.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `transaction.created` | A transaction is first created | Record the pending transfer, show it in your UI |
| `transaction.status.updated` | The transaction's primary status changes (e.g. `SUBMITTED` → `COMPLETED`) | Update order/settlement state, credit balances on completion |
| `transaction.approval_status.updated` | The approval/authorization status changes | Notify approvers, gate release of funds |
| `transaction.network_records.processing_completed` | On-chain / network processing finishes | Reconcile against `NetworkRecord` details, confirmations |
| `transaction.alert.stuck` | Transactions from a vault account are stuck `CONFIRMING` on an EVM chain, usually because of low fees | Alert ops, trigger a fee boost (`BOOST_TRANSACTION`) |

### Transaction status values

`transaction.status.updated` reflects the transaction lifecycle, including statuses such as `SUBMITTED`, `PENDING_SIGNATURE`, `PENDING_AUTHORIZATION`, `BROADCASTING`, `CONFIRMING`, `COMPLETED`, `FAILED`, `REJECTED`, `CANCELLED`, and `BLOCKED`. Treat `COMPLETED` as the terminal success state.

## Other Event Categories

Beyond transactions, Webhooks v2 covers additional categories that use the same envelope:

- `vault_account.*` — vault accounts, their assets and balances, and bulk jobs
- `internal_wallet.*`, `external_wallet.*`, `contract_wallet.*` — whitelisted wallet assets added or removed (the Whitelist category)
- `embedded_wallet.*` — embedded (non-custodial) wallets, assets and devices
- `exchange_account.*`, `fiat_account.*`, `connected_account.*` — connected CeFi accounts
- `connection.*` — Fireblocks Network connections
- `ticket.*` — Smart Transfer tickets and terms
- `onchain_data.updated` — logs from managed tokenization contracts

## Full Event Reference

For the complete, authoritative list of events and payload schemas, see the [Fireblocks webhooks overview](https://developers.fireblocks.com/reference/webhooks-overview) and the [transaction event types](https://developers.fireblocks.com/reference/webhooks-structures-eventtypes-transaction).
