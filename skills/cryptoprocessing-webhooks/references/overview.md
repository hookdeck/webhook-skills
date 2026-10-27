# CryptoProcessing Webhooks Overview

## What Are CryptoProcessing Callbacks?

[CryptoProcessing](https://cryptoprocessing.com/) (by CoinsPaid) is a crypto payment gateway. It reports status changes of deposits, withdrawals, exchanges, payment requests and legacy invoices by POSTing a JSON callback to the one callback URL set in the merchant portal. The docs call them callbacks; they are ordinary webhooks.

## Common Event Types

There is no event header. The body's top-level `type` names the kind of transaction and `status` its new state. A callback is sent on every status change, so the same transaction arrives several times with different `status` values.

| `type` | Triggered When | Common Use Cases |
|--------|----------------|------------------|
| `deposit` | A deposit to one of your addresses changes status | Credit user balances |
| `withdrawal` | A withdrawal changes status | Settle or fail a payout |
| `exchange` | A currency conversion changes status | Update conversion records |
| `payment_request` | A payment request changes status | Fulfil orders |
| `deposit_exchange` | A deposit that is converted on arrival changes status | Credit the converted amount |
| `deposit_wallet_client` | A wallet client deposit changes status | Wallet top-ups |
| `withdrawal_exchange` | A withdrawal funded by a conversion changes status | Payouts in another currency |
| `withdrawal_instant` | An instant withdrawal changes status | Fast payouts |
| `withdrawal_instant_exchange` | An instant withdrawal funded by a conversion changes status | Fast payouts in another currency |
| `invoice` | A legacy invoice changes status | Older integrations |

`status` values include `confirmed`, `not_confirmed`, `cancelled`, `pending`, `paid`, `expired` and `failed`; the set differs per kind (a `payment_request` callback shows `processing`, for example). Check the per-kind page of the docs for the full list.

## Event Payload Structure

A documented `deposit` callback:

```json
{
  "id": 1,
  "end_user_reference": "user_12345",
  "type": "deposit",
  "crypto_address": { "id": 1, "currency": "USDC", "address": "0x9F2E…9E0F", "tag": null, "foreign_id": "12345" },
  "currency_sent": { "currency": "USDC", "amount": "1000.00000000" },
  "currency_received": { "currency": "USDC", "amount": "1000.00000000", "amount_minus_fee": "997.00000000" },
  "transactions": [ { "id": 1, "transaction_type": "blockchain", "type": "deposit", "txid": "0x3c8f…b1c9", "confirmations": 3 } ],
  "fees": [ { "type": "deposit", "currency": "USDC", "amount": "3.00000000" } ],
  "error": "",
  "status": "confirmed"
}
```

- `id` identifies the transaction; `payment_request` callbacks use `payment_request_id` instead.
- `foreign_id` is the id you supplied when creating the address, withdrawal or request.
- `currency_sent`, `currency_received`, `transactions` and `fees` carry the amounts, as decimal strings.
- Other kinds add their own fields (for example `expires_at` on `payment_request` and `invoice`).

## Delivery and Retries

- Only HTTP `200` stops delivery. Anything else is retried.
- 12 retries after the initial attempt, at +1, +5, +15, +30, +60, +90, +120, +180 minutes and then +240 minutes four times. Not configurable.
- Answer a duplicate of a callback you already processed successfully with `201` to stop its retries.
- A transaction produces one callback per status change and retries resend the same one, so make handlers idempotent and key on `type`, the id and `status`.

## Full Event Reference

See the [callbacks overview](https://docs.cryptoprocessing.com/api-reference/callbacks/callbacks-overview) and the per-kind pages linked from it.
