# BlindPay Webhooks Overview

## What Are BlindPay Webhooks?

[BlindPay](https://blindpay.com) is a stablecoin and fiat payins/payouts API. Webhooks push
changes to customers, bank accounts, wallets, payins, payouts, virtual accounts, transfers,
limit increases and payables to HTTPS endpoints registered on an instance, so you don't have to
poll the API. BlindPay delivers them through Svix, and every delivery is signed (see
[verification.md](verification.md)).

| Aspect | Value |
|--------|-------|
| Method | `POST`, JSON body |
| Signature headers | `svix-id`, `svix-timestamp`, `svix-signature` (Standard Webhooks) |
| Endpoints | Up to 25 per instance; an empty `events` array subscribes to every event |
| Success | Return a `2xx`; non-2xx responses are retried with backoff over the following hours |
| Dedup key | `svix-id` stays the same across retries and replays of the same event |

## Common Event Types

BlindPay documents 26 events, grouped by the resource that triggers them. The list may not be
exhaustive, so return `200` for events you don't handle.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `customer.new` | A customer is created | Sync customer records |
| `customer.update` | A customer is updated, including a KYC status change from BlindPay's compliance review | Unlock features after KYC approval |
| `customer.delete` | A customer is deleted | Remove local records |
| `bankAccount.new` | A bank account is added to a customer | Offer it as a payout destination |
| `blockchainWallet.new` | A blockchain wallet is added to a customer | Offer it as a payout destination |
| `blockchainWallet.update` | The self-custody answer of a blockchain wallet is saved | Compliance bookkeeping |
| `tos.accept` | A customer accepts the terms of service | Record acceptance |
| `payin.new` | A payin is created (any payment method, or a deposit into a virtual account) | Show a pending deposit |
| `payin.update` | The payin advances through an intermediate step, such as an arrival check or manual review | Progress display |
| `payin.complete` | The payin finishes: sent to the destination wallet, refunded, or failed | Credit the customer, branch on `status` |
| `payout.new` | A payout is created and the source funds have been captured | Show a pending payout |
| `payout.update` | The payout advances (document checks, manual review, bank send), or reaches `failed` | Progress display, failure handling |
| `payout.complete` | The payout finishes successfully: confirmed at the destination, or refunded | Mark paid out |
| `virtualAccount.new` | A virtual account is created or requested for a customer | Show "pending approval" |
| `virtualAccount.complete` | The virtual account is approved and an account number is issued | Show deposit details |
| `transfer.new` | A stablecoin transfer is created | Track in-flight transfers |
| `transfer.update` | The transfer advances (for example a cross-chain burn confirmation), or fails to confirm | Progress display |
| `transfer.complete` | The transfer confirms on-chain | Mark settled |
| `wallet.new` | A managed wallet is created for a customer | Store the wallet id |
| `wallet.update` | A managed wallet's yield status changes | Update balances shown |
| `wallet.inbound` | A stablecoin deposit is detected in a managed wallet | Credit the deposit |
| `limitIncrease.new` | A customer requests a transaction limit increase | Notify operations |
| `limitIncrease.update` | BlindPay's compliance review approves or rejects the request | Notify the customer |
| `payable.new` | A payable (bill) is registered as a draft | Track bills |
| `payable.update` | The bill changes: claimed by a payout (`processing`), failed or refunded (back to `draft`), or deleted (`canceled`) | Sync bill state |
| `payable.complete` | The payout executing the payable finishes and the bill is paid | Mark the bill paid |

The legacy `receiver.*` events were retired with the July 2026 receivers-to-customers sunset and
no longer fire; use `customer.*`.

For fiat flows you will mostly see `virtualAccount.complete`, `payin.complete`, `payout.new`,
`payout.complete` and `bankAccount.new`. For stablecoin flows: `wallet.inbound`,
`blockchainWallet.new`, `payin.complete`, `payout.complete`, `transfer.new` and `transfer.complete`.

## Event Payload Structure

The body is flat: `webhook_event` carries the event name, followed by the resource's own fields.
There is no wrapper object. A `payin.complete` payload from the docs:

```json
{
  "webhook_event": "payin.complete",
  "id": "pi_000000000000",
  "status": "completed",
  "customer_id": "re_000000000000",
  "receiver_amount": 10000,
  "sender_amount": 10000,
  "payment_method": "ach",
  "partner_fee": 0,
  "billing_fee_amount": 0,
  "transaction_fee_amount": 250,
  "blindpay_bank_details": { "bank_name": "Example Bank, N.A.", "account_number": "000000000000", "routing_number": "000000000" },
  "memo_code": "BP-AB12CD",
  "tracking_complete": { "step": "completed", "completed_at": "2026-06-01T12:00:00.000Z" },
  "tracking_payment": { "step": "completed", "completed_at": "2026-06-01T11:58:00.000Z" },
  "tracking_transaction": { "step": "completed", "transaction_hash": "0x000...", "completed_at": "2026-06-01T11:59:00.000Z" }
}
```

Other resources carry their own fields next to `webhook_event`; look up the resource's API
reference for them. `id` is the resource id (`pi_...` for payins, for example), so the same `id`
appears across `.new`, `.update` and `.complete` events of one resource.

## Delivery Rules Worth Planning For

- **Verify before acting.** Keep signature verification ahead of any balance credit or state change.
- **Deduplicate on `svix-id`.** It is stable across retries and across dashboard replays.
- **Replays resend the exact original payload** with a new delivery attempt; they don't create a
  new business event, so they are safe for backfilling a fixed handler.
- **Don't assume ordering.** Branch on the resource `status`, not only on the event name.

## Full Event Reference

See BlindPay's [webhook events catalog](https://blindpay.com/docs/learn/webhooks-events),
[webhooks guide](https://blindpay.com/docs/learn/webhooks) and
[verification guide](https://blindpay.com/docs/learn/webhooks-verification).
