# Layerswap Webhooks Overview

## What Are Layerswap Webhooks?

[Layerswap](https://layerswap.io) is a crypto bridging and exchange-to-chain swap API. Webhooks
push swap status updates to an HTTPS endpoint you configure per app in the Partner Dashboard, so
you don't have to poll `GET /swaps/{id}`. Layerswap delivers them through Svix, and every
delivery is signed (see [verification.md](verification.md)).

| Aspect | Value |
|--------|-------|
| Method | `POST`, JSON body |
| Signature headers | `svix-id`, `svix-timestamp`, `svix-signature` (Standard Webhooks) |
| Success | Return a `2xx` only after the event is durably accepted; process slow work asynchronously |
| Delivery | No retry schedule, timeout or ordering guarantee is documented |

Layerswap's docs mark event, retry, ordering and payload guarantees as gaps, so don't hard-code
a retry schedule or assume order. Deduplicate on `swap.id` plus the resulting `status` (or
transaction hash) and reconcile with `GET /swaps/{id}`.

## Event Payload Structure

There is **no event-type field**. The body describes the swap at the status available when it
was sent. Docs give this representative shape (placeholders such as `SWAP_ID`, `0x...`):

```json
{
  "swap": {
    "id": "SWAP_ID",
    "status": "ls_transfer_pending",
    "destination_address": "0x...",
    "requested_amount": 100,
    "fail_reason": null,
    "metadata": { "reference_id": "your-external-id" },
    "transactions": []
  },
  "quote": { "receive_amount": 99.5, "min_receive_amount": 99.0 },
  "deposit_actions": []
}
```

| Field | Meaning |
|-------|---------|
| `swap.id` | The durable key for the swap |
| `swap.status` | The swap's lifecycle state. The handlers branch on this |
| `swap.metadata` | Your own data, such as `reference_id` |
| `swap.transactions` | Input, output, refuel and refund transactions, each with its own `type` and `status` |
| `quote` | `receive_amount` and `min_receive_amount`; more quote data arrives as processing progresses |
| `deposit_actions` | What the user must do to fund the swap |

`swap.status` is a lifecycle state, not a documented event name. Use the swap-level `status` for
the overall swap and the transaction status for one on-chain operation.

## Swap Statuses

These are the `swap.status` values from Layerswap's swap lifecycle docs. The examples handle
exactly these and acknowledge anything else with `200`.

| `swap.status` | Meaning | Common Use Cases |
|---------------|---------|------------------|
| `user_transfer_pending` | Swap created; waiting for the user's deposit on the source network. No deposit within 6 hours becomes `expired` | Show deposit instructions |
| `ls_transfer_pending` | Deposit confirmed; Layerswap is executing the swap. It can retry automatically, and without a `refund_address` it stays here until resolved | Progress display |
| `completed` | Funds were delivered to the destination address. Terminal | Fulfil after reconciling with `GET /swaps/{id}` |
| `failed` | For example the deposit was below the minimum. Terminal | Read `fail_reason`, notify |
| `expired` | No deposit arrived in time. Terminal | Clean up the pending order |
| `pending_refund` | Execution failed and retries are exhausted; a refund to `refund_address` is queued | Tell the user a refund is coming |
| `refunded` | The refund was confirmed on-chain, minus gas fees. Terminal | Refund bookkeeping |

The status names are snake_case on swap objects. The `GET /swaps` filter uses different
PascalCase values (`PendingDeposit`, `PendingWithdrawal`, `PendingRefund`, `Completed`,
`Failed`, `Expired`, `Refunded`); don't mix them up.

## Delivery Rules Worth Planning For

- **Verify before acting.** Keep signature verification ahead of any balance credit, order
  fulfilment or database state change.
- **Don't trust the payload alone.** Fetch `GET /swaps/{id}` before irreversible business logic.
- **Deduplicate side effects** by swap ID and resulting status or transaction hash.
- **Reconcile periodically** with the track-swaps API, since delivery guarantees are not documented.
- **No per-event selection.** One or more endpoint URLs are configured per app, and no event
  filter is documented.

## Full Reference

See Layerswap's [webhooks](https://docs.layerswap.io/api/webhooks) page and the
[swap lifecycle](https://docs.layerswap.io/concepts/swap-lifecycle) page.
