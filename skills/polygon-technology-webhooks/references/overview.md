# Polygon Technology OMS Webhooks Overview

## What Are Polygon Technology OMS Webhooks?

OMS is Polygon Technology's payments platform for stablecoin payments and orchestration: customers, external bank accounts, counterparties, custodial wallets, deposit addresses, virtual accounts, cash-ins, transactions and transfers. OMS sends an HTTPS `POST` to your endpoint whenever one of those resources is created, changes status, or changes in some other visible way. Every delivery is signed with `Webhook-Signature` (see [verification.md](verification.md)).

This is not the Polygon PoS blockchain. OMS sends no block, log or token-transfer events. For chain activity, use a provider such as Alchemy or QuickNode.

Sources: [Receiving webhooks](https://docs.polygon.technology/payments/guides/receiving-webhooks) and the [webhook events catalog](https://docs.polygon.technology/api-reference/webhook-events).

## What Does the Envelope Look Like?

Every delivery has the same six top-level fields:

```json
{
  "id": "evt_01m48wyjzsf4sadyyn9ts7wdrr",
  "idempotencyKey": "36edb21c-5b34-5dcd-be8c-d1942d27e62b",
  "type": "transfer.statusChanged",
  "createdAt": "2026-10-06T15:22:40.505Z",
  "schema": "v1",
  "data": {
    "resource": { "id": "trf_01mt5c8e0g2j4k6m8p0r2t4v6x", "status": "settled" },
    "previousStatus": "pending"
  }
}
```

| Field | Meaning |
|---|---|
| `id` | `evt_` plus 26 base32 characters. The same on every retry of an event. Don't parse it as a UUID. |
| `idempotencyKey` | A UUID, the same on every emission of one change. Catches a repeat that arrives with a new `id`. |
| `type` | `<resource>.created`, `<resource>.statusChanged` or `<resource>.updated`. |
| `createdAt` | When OMS recorded the change (never the send time), UTC with exactly three fractional digits. Strictly increasing per resource. |
| `schema` | `"v1"`. An empty string marks an event written before the current format. |
| `data.resource` | On every event. The resource as its `GET` endpoint returns it, with empty lists left out. |
| `data.previousStatus` | `*.statusChanged` only. Left out the first time OMS sees the resource. |
| `data.changedFields` | `*.updated` only. The names of the fields that changed. |

A field that doesn't apply, or has no value yet, is left out rather than sent as `null`. Use optional access (`resource.address?.…`, `.get()`), not `=== null` checks.

## Which Events Does OMS Send?

The catalog lists 26 event types across 9 resources. Each resource sends `created` once, `statusChanged` on every status change, and `updated` for any other visible change. `transaction` has no `updated` event. Deleting or closing a resource is a status change.

| Resource | Events | Statuses |
|---|---|---|
| `customer` | `customer.created`, `customer.statusChanged`, `customer.updated` | `pending`, `actionRequired`, `active`, `rejected`, `offboarded` |
| `externalAccount` | `externalAccount.created`, `externalAccount.statusChanged`, `externalAccount.updated` | `pending`, `active`, `rejected`, `invalid`, `deleted`, `failed` |
| `counterparty` | `counterparty.created`, `counterparty.statusChanged`, `counterparty.updated` | `active`, `rejected`, `deleted` |
| `customerWallet` | `customerWallet.created`, `customerWallet.statusChanged`, `customerWallet.updated` | `pending`, `active`, `frozen`, `suspended`, `closed` |
| `depositAddress` | `depositAddress.created`, `depositAddress.statusChanged`, `depositAddress.updated` | `pending`, `active`, `frozen`, `closed`, `failed`, `inactiveActionRequired` |
| `virtualAccount` | `virtualAccount.created`, `virtualAccount.statusChanged`, `virtualAccount.updated` | `pending`, `active`, `frozen`, `closed`, `failed`, `inactiveActionRequired`, `deleting`, `deleted` |
| `cashIn` | `cashIn.created`, `cashIn.statusChanged`, `cashIn.updated` | `pending`, `processing`, `completed`, `failed`, `expired` |
| `transaction` | `transaction.created`, `transaction.statusChanged` | `processing`, `awaitingAction`, `completed`, `failed`, each with a dotted `subStatus` |
| `transfer` | `transfer.created`, `transfer.statusChanged`, `transfer.updated` | `initiated`, `pending`, `settled`, `failed`, `returned` |

Status, sub-status and event-type lists can grow without a version bump.

A resource that existed before you subscribed has no `created` event, so treat the first event you see for an ID as its creation.

### Resource Notes

- **`transaction`**: branch on `status`; `subStatus` (for example `processing.awaitingFiatOut`, `processing.underReview`, `completed.settled`) adds detail. A change of `subStatus` alone also sends `transaction.statusChanged`, with `previousStatus` equal to `status`, so that isn't a no-op. For an unknown `subStatus`, fall back to the part before the dot (`processing.payoutHeld` → `processing`). Sub-statuses are listed in the [transaction lifecycle](https://docs.polygon.technology/payments/core-concepts/transaction-lifecycle#sub-statuses).
- **`transfer`**: one movement of money on one rail. A transaction is made of a `deposit` transfer, a `payout` transfer, and a `refund` transfer when money goes back to the sender. A transfer that moves through several statuses at once sends one `statusChanged` per status. `transfer.updated` reports late details such as a transaction hash in `tracking`.
- **`customer`**: sent a short delay after the change. `data.resource` is the `GET /customers/{customerId}` body without balances or empty lists. A customer OMS sees for the first time is announced `pending` in `customer.created`, then moved by `customer.statusChanged` with `previousStatus: "pending"`, even if it was already `active`. Endorsement changes arrive as `customer.updated` with `endorsements` in `changedFields`.
- **`customerWallet`**: `created` carries `pending` with no `address`; `statusChanged` to `active` carries the address. `updated` covers `label`, `metadata` and the first `address`.
- **`depositAddress`**: `created` carries `pending`. `changedFields` on `updated` is a subset of `destination`, `payout`, `returnDestination`, `label`, `metadata`, `depositInstructions`.
- **`virtualAccount`**: `created` carries `pending`. `changedFields` on `updated` is a subset of `depositInstructions`, `destination`, `label`, `metadata`, `payout`, `returnDestination`, `returnPayout`. A delete sends `statusChanged` into `deleting`, then again into `deleted`.
- **`cashIn`**: refreshing the cash-in code sends `cashIn.updated` with `changedFields: ["depositInstructions"]`.
- **`externalAccount`**: a move to `invalid` (for example after a bank return) always sends `statusChanged`.

Deposits into deposit addresses and virtual accounts, and their payouts, are reported through `transaction.*` and `transfer.*`. There are no per-rail deposit or payout events.

### Never Delivered

`transaction.cryptoToCrypto.underReview`, `transaction.cryptoToFiat.underReview` and `transaction.fiatToCrypto.underReview` exist for compliance only. They are never delivered and can't be subscribed to. A transaction under review reads `processing.underReview` and is announced through `transaction.statusChanged`.

## How Does Delivery Work?

- **At-least-once, in parallel, unordered.** Dedupe on `id` (unique constraint) and on `idempotencyKey`. Order by `createdAt` per resource: apply an event only if its `createdAt` is newer than the last one applied for that resource ID. There is no sequence number. The ISO strings compare correctly as text.
- **Cross-resource order isn't guaranteed either.** A `transfer.created` can land before the `transaction.created` it belongs to. Hold it until the transaction arrives, or fetch it with `GET /transactions/{transactionId}`.
- **Respond before you process.** Each attempt is bounded by the webhook's `timeoutMs` (default 5000, maximum 10000), from connect through response. A slower response counts as a failed attempt and is retried, even if your handler eventually succeeded.
- **Any non-2xx, timeout or network error is retried.** Status codes aren't special-cased: `410 Gone` doesn't stop delivery.

### Retry Schedule

| Attempts so far | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| Delay before the next | 0s | 5s | 10s | 30s | 1m | 10m | 1h | 6h | 1d | 2d |

10 attempts over roughly 3 days, then the delivery is marked `failed`. Requeue with `POST /webhooks/{webhookId}/deliveries/retry` (see [setup.md](setup.md)).

### When Your Endpoint Stays Down

Two separate clocks:

- **Notification** once the endpoint has been failing longer than `notifyThresholdSecs` (10 minutes to 1 day, default 1 hour). Sent once per down episode.
- **Auto-suspension** after roughly 3 days (~72 hours) of continuous failure.

A `suspended` webhook still creates delivery rows, recorded as `skipped`, so nothing is lost. A `disabled` webhook creates no rows at all: events fired while disabled can't be recovered. Delivery history is kept for 30 days and is the only way to recover missed events; there is no `GET /events`.

## Full Event Reference

[Webhook events catalog](https://docs.polygon.technology/api-reference/webhook-events).
