# GlobalStack Webhooks Overview

## What Are GlobalStack Webhooks?

[GlobalStack](https://globalstack.io) is a stablecoin and fiat money-movement API: onramps,
offramps, conversions, transfers, deposits and KYC verifications. It sends an HTTPS `POST` to an
endpoint you register when one of those resources changes, so you don't have to poll. Deliveries
go through Svix and are signed (see [verification.md](verification.md)).

| Aspect | Value |
|--------|-------|
| Method | `POST`, JSON body |
| Signature headers | `svix-id`, `svix-timestamp`, `svix-signature` (Standard Webhooks) |
| Success | Any `2xx`, returned quickly (a slow handler looks like a failure and is retried) |
| Delivery | At-least-once, not ordered. Deduplicate on `event_id` |

GlobalStack's docs don't print a retry schedule or a response timeout, so don't hard-code either.

## Event Payload Structure

Every event, in every category, arrives in the same flat envelope:

```json
{
  "event_id": "evt_1b8dbe64-1f4e-5a2c-9c31-6d9a51a0f0c2",
  "event_type": "conversion.success",
  "event_category": "conversion",
  "event_developer_id": "int_01HXYZABC1234567890ABCDEFG",
  "api_version": "v1",
  "event_created_at": "2026-09-30T09:12:44.000Z",
  "event_object_id": "con_01KPBH8MD6R7YDJ82T4D6M3V1T",
  "event_object_status": "success",
  "event_object_changes": { "status": ["processing", "success"] },
  "event_object": { }
}
```

| Field | Meaning |
|-------|---------|
| `event_id` | `evt_` id, stable across retries. Equals `svix-id` without its `msg_` prefix |
| `event_type` | The event name. Branch on this |
| `event_category` | The subscription family (`onramp`, `offramp`, `conversion`, `transfer`, `deposit`, `kyc`) |
| `event_developer_id` | Your integration's public id |
| `api_version` | Envelope version, `v1` today |
| `event_created_at` | When the event happened. A retry keeps the original time |
| `event_object_id` | Id of the resource (`onr_…`, `ofr_…`, `con_…`, `tfr_…`, `txn_…`) |
| `event_object_status` | The resource's status at the moment of the event |
| `event_object_changes` | `{ "status": [previous, new] }` on a real change, `null` otherwise |
| `event_object` | The REST resource body plus event-only fields |

`event_object` carries extras that only make sense on an event: `actual_source_amount`,
`actual_destination_amount`, `actual_rate` (what really settled; reconcile money against these,
not the quoted `rate`), `terminal_at`, and `transaction` (ids for joining deliveries about the
same money; join on `root_transaction_id`). Deposits carry the transaction ids flat.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `onramp.awaiting_deposit` | The onramp is created and waiting for the payer's deposit | Show the payer `deposit_instruction` |
| `onramp.funds_received` | The deposit arrived and was recognised | Tell the customer the money is in |
| `onramp.processing` | The conversion is in flight | Progress display |
| `onramp.success` | The destination crypto was delivered. Terminal | Fulfil, reconcile `actual_*` |
| `onramp.failed` | Could not complete. Terminal | Read `failure_reason`, notify |
| `onramp.returned` | Funds were sent back. Terminal | Refund bookkeeping |
| `offramp.created` | An offramp is created and accepted | Track the payout |
| `offramp.funds_received` | Funds arrived and were recognised | Progress display |
| `offramp.processing` | The payout is in flight | Progress display |
| `offramp.success` | The fiat payout completed. Terminal | Confirm to the customer |
| `offramp.failed` | Could not complete. Terminal | Read `failure_reason`, notify |
| `offramp.returned` | The payout bounced; a debited wallet is credited back. Terminal | Reconcile the refund |
| `conversion.created` | A conversion is created and accepted | Track the conversion |
| `conversion.funds_received` | Funds arrived and were recognised | Progress display |
| `conversion.processing` | The conversion is in flight | Progress display |
| `conversion.success` | The destination wallet was credited. Terminal | Reconcile `actual_*` |
| `conversion.failed` | Could not complete (`quote_expired` is not a genuine failure). Terminal | Read `failure_reason` |
| `conversion.returned` | Funds were sent back. Terminal | Refund bookkeeping |
| `transfer.processing` | The payout has been submitted | Progress display |
| `transfer.success` | The payout completed. Terminal | Confirm to the beneficiary side |
| `transfer.failed` | Failed, cancelled or reversed. Terminal | `failure_reason` says which |
| `deposit.received` | Funds seen but not final | Pending balance |
| `deposit.held` | Credited but withheld; `metadata.hold_reason` says why | Compliance review |
| `deposit.confirmed` | Settled and spendable. Terminal | Release goods or credit |
| `deposit.failed` | Could not be credited. Terminal | Investigate |
| `kyc.approved` | Verification passed; `customer.tier` is the new tier | Unlock limits |
| `kyc.rejected` | Verification declined | Read `failure_reason` |

The examples handle exactly these 27 events and acknowledge anything else with `200`.

## Subscriptions Are by Category

You subscribe an endpoint to categories (`onramp`, `offramp`, `conversion`, `transfer`,
`deposit`, `kyc`), not to single events, and receive every event in each family.

## Delivery Rules Worth Planning For

- **Not ordered.** Use `event_object_status` and `event_object_changes`, and ignore an event that
  would move a resource backwards from a terminal state.
- **At most once per resource per event.** A cancelled and then reversed transfer both map to
  `transfer.failed` and reach you once.
- **A held deposit sends two events:** `deposit.held`, then `deposit.confirmed` when released.
- **A cross-currency deposit never reaches a terminal `deposit.*` event.** It stays at
  `received` and the `conversion.*` events carry the outcome.
- **Returned offramps refund automatically** and emit no `deposit.*` event; `offramp.returned`
  is the signal.
- **KYC sends only final outcomes.** Intermediate progress is on the verifications REST endpoint.

## Full Event Reference

See GlobalStack's [webhook events](https://docs.globalstack.io/webhooks/events) page for every
payload shape.
