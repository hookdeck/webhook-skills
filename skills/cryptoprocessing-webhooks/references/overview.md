# CryptoProcessing Webhooks Overview

## What Are CryptoProcessing Callbacks?

[CryptoProcessing](https://cryptoprocessing.com/) (by CoinsPaid) is a crypto payment gateway. It reports status changes of deposits, withdrawals, exchanges, payment requests and legacy invoices by POSTing a JSON callback to the one callback URL set in the merchant portal. The docs call them callbacks; they are ordinary webhooks.

## Common Event Types

There is no event header. The body's top-level `type` names the kind of transaction and `status` its new state. Deposits, withdrawals, payment requests and invoices send a callback on each status change, so the same transaction arrives several times. Exchanges send one, when the exchange completes.

| `type` | Triggered When | Common Use Cases |
|--------|----------------|------------------|
| `deposit` | A deposit to one of your addresses changes status | Credit user balances |
| `withdrawal` | A withdrawal changes status | Settle or fail a payout |
| `exchange` | An exchange made with `/v2/exchange/fixed` or `/v2/exchange/now` completes | Update conversion records |
| `payment_request` | A payment request changes status | Fulfil orders |
| `deposit_exchange` | A deposit that is converted on arrival changes status | Credit the converted amount |
| `deposit_wallet_client` | A deposit to a merchant top-up address changes status (needs business wallet transactions callbacks) | Merchant top-ups |
| `withdrawal_exchange` | A withdrawal funded by a conversion changes status | Payouts in another currency |
| `withdrawal_instant` | An instant withdrawal changes status | Fast payouts |
| `withdrawal_instant_exchange` | An instant withdrawal funded by a conversion changes status | Fast payouts in another currency |
| `invoice` | A legacy invoice changes status | Older integrations |

`status` differs per kind: deposits `not_confirmed`, `confirmed`, `cancelled`; withdrawals `pending`, `confirmed`, `declined`, `cancelled`; exchanges `confirmed`; payment requests `processing`, `paid`, `expired`, `failed`; invoices `pending`, `processing`, `confirmed`, `failed`. Payment requests send `processing` again for each detected transaction, and invoices send `pending` again for each partial payment.

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
  "transactions": [ { "id": 1, "transaction_type": "blockchain", "type": "deposit", "txid": "0x3c8f…b1c9", "confirmations": "3" } ],
  "fees": [ { "type": "deposit", "currency": "USDC", "amount": "3.00000000" } ],
  "error": "",
  "status": "confirmed"
}
```

- `id` identifies the transaction; `payment_request` callbacks use `payment_request_id` instead.
- `foreign_id` is the id you supplied when creating the withdrawal, request or invoice. On deposits it's `crypto_address.foreign_id`, from the address you created; portal-created addresses have `crypto_address.title` instead.
- `currency_sent`, `currency_received`, `transactions` and `fees` carry the amounts, as decimal strings.
- Other kinds add their own fields (for example `expires_at` on `payment_request` and `invoice`).

## Delivery and Retries

- Only HTTP `200` stops delivery. Anything else is retried.
- 12 retries after the initial attempt, at +1, +5, +15, +30, +60, +90, +120, +180 minutes and then +240 minutes four times. Not configurable.
- Answer a duplicate of a callback you already processed successfully with `201` to stop its retries.
- Retries resend the same callback, so make handlers idempotent. Key on `type`, the id, `status` and the `txid`s in `transactions`, because invoices and payment requests repeat `pending` and `processing` with a new transaction each time. Exchanges have no `txid`.
- The portal's **Repeat callback** button resends a transaction's latest callback.

## Full Event Reference

See the [callbacks overview](https://docs.cryptoprocessing.com/api-reference/callbacks/callbacks-overview) and the per-kind pages linked from it.
