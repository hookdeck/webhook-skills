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
| Delivery | No retry schedule, timeout value or ordering guarantee is documented by Layerswap |

Layerswap documents no retry schedule or ordering, so don't hard-code one or assume order.
Svix's own defaults (a `2xx` within 30 seconds, 8 attempts over about 27 hours) are Svix's, and
Layerswap doesn't say it keeps them. Deduplicate side effects on the swap `id` plus the
resulting `status` (or a transaction hash) and reconcile with `GET /swaps/{id}`.

## Event Payload Structure

Layerswap sends every update through one Svix event type, `partner`, which is not in the body.
There is **no event-type field**: the body is a flat object describing the swap. Layerswap's
example (placeholders such as `SWAP_ID` and `0x...` are Layerswap's):

```json
{
  "id": "SWAP_ID",
  "from": "ETHEREUM_MAINNET",
  "to": "BASE_MAINNET",
  "fee": 0.5,
  "source_address": null,
  "deposit_address": "0x...",
  "status": "PendingDeposit",
  "app_name": "YOUR_APP_CLIENT_ID",
  "is_testnet": false,
  "from_network": {
    "name": "ETHEREUM_MAINNET",
    "display_name": "Ethereum",
    "logo": "https://example.com/ethereum.png"
  },
  "to_network": {
    "name": "BASE_MAINNET",
    "display_name": "Base",
    "logo": "https://example.com/base.png"
  },
  "asset": {
    "asset": "USDC",
    "display_name": "USD Coin",
    "refuel": false,
    "contract": "0x...",
    "decimals": 6
  },
  "amount": 100,
  "to_address": "0x...",
  "reference_id": "your-external-id",
  "transactions": [],
  "timestamp": 1793577600000
}
```

| Field | Meaning |
|-------|---------|
| `id` | The swap ID, and the durable key for the swap |
| `status` | The swap's lifecycle state, in PascalCase. The handlers branch on this |
| `reference_id` | Your app's correlation reference, set when you create the swap |
| `transactions` | Entries with `transaction_id`, `type`, `from`, `to`, `amount`, `usd_price`, `usd_value`, `created_date`, `timestamp`, `confirmations`, `max_confirmations` and `explorer_url` |
| `timestamp` | When the webhook message was created, in Unix milliseconds |
| `source_address` | Can be `null` |

`status` is a lifecycle state, not a documented event name.

## Swap Statuses

Webhook `status` values use PascalCase. API swap objects use snake_case for the same states,
so don't compare one form with the other. The examples handle each value below and acknowledge
any other with `200`.

| Webhook `status` | API `status` | Meaning | Common Use Cases |
|------------------|--------------|---------|------------------|
| `PendingDeposit` | `user_transfer_pending` | Swap created; waiting for the user's deposit. No deposit within 6 hours becomes `Expired` | Show deposit instructions |
| `PendingWithdrawal` | `ls_transfer_pending` | Deposit confirmed; Layerswap is processing the swap and may retry failed operations. Not final | Progress display |
| `Completed` | `completed` | Funds were delivered to the destination address. Terminal | Fulfil after confirming with `GET /swaps/{id}` |
| `Failed` | `failed` | For example the deposit was below the minimum. Terminal | Fetch the swap and read `fail_reason`, notify |
| `Expired` | `expired` | No deposit arrived within 6 hours. Terminal | Cancel the pending order |
| `PendingRefund` | `pending_refund` | A failure eligible for an automatic refund; a refund to `refund_address` is under way | Tell the user a refund is coming |
| `Refunded` | `refunded` | The refund was confirmed on-chain, minus gas fees. Terminal | Refund bookkeeping |

The `GET /swaps` status filters use the same PascalCase values as webhooks.

## Delivery Rules Worth Planning For

- **Verify before acting.** Keep signature verification ahead of any balance credit, order
  fulfilment or database state change.
- **Don't trust the payload alone.** Fetch `GET /swaps/{id}` before crediting funds or
  fulfilling an order, and act on the current status.
- **Deduplicate side effects** by swap ID and resulting status or transaction hash.
- **Compare `timestamp`** with the last one you stored for a swap, since order isn't documented.
- **Reconcile periodically** with the track-swaps API.
- **No per-event selection.** One or more endpoint URLs are configured per app, and no event
  filter is documented.

## Full Reference

See Layerswap's [webhooks](https://docs.layerswap.io/api/webhooks) page, the
[swap lifecycle](https://docs.layerswap.io/concepts/swap-lifecycle) page and
[track swaps](https://docs.layerswap.io/api/track-swaps) for the status mapping.
