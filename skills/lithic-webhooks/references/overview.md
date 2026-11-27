# Lithic Webhooks Overview

## What Are Lithic Webhooks?

Lithic is a card issuing and money-movement platform. Its [Events API](https://docs.lithic.com/docs/events-api)
pushes real-time notifications ("events") to HTTPS endpoints you register as
**event subscriptions**. Instead of polling the API, your service reacts as cards
are created, transactions authorize and clear, disputes progress, and payments
move.

Lithic webhook signatures follow the [Standard Webhooks](https://www.standardwebhooks.com/)
layout. Every delivery includes `webhook-id`, `webhook-timestamp`, and
`webhook-signature` headers so you can verify authenticity (see
[verification.md](verification.md)).

## Event Payload Structure

There is no envelope. The body is the resource object for that event type, with
`event_type` added at the top level. A `card.created` body, from the example in
Lithic's [OpenAPI spec](https://github.com/lithic-com/lithic-openapi):

```json
{
  "event_type": "card.created",
  "card_token": "00000000-0000-0000-0000-000000000001",
  "replacement_for": "00000000-0000-0000-0000-000000000000"
}
```

Key points:

- `event_type`: the `resource.action` string you switch on (e.g. `card.created`).
- The other fields depend on the type. `card_transaction.updated` sends the whole
  transaction (its `token`, `status`, `amount` and an `events` list), and
  `balance.updated` sends a `data` list of balances.
- The body has no event id or created time. The `webhook-id` header is the event
  token (the same value the Events API returns as `token`), and it stays the same
  when a message is resent, so use it as the idempotency key.
- Don't deduplicate on the body's `token`: on `card_transaction.updated` it is the
  transaction's token, which every later event for that transaction repeats.
- The Events API's `GET /v1/events/{event_token}` returns a different shape
  (`token`, `event_type`, `payload`, `created`) for stored events. That is not
  what your endpoint receives.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `card.created` | A new card is issued | Provision card records, notify the user |
| `card.updated` | A card's state/attributes change | Sync PAUSED/CLOSED state |
| `card_transaction.updated` | A card auth or clearing updates | Reconcile ledgers, update transaction status |
| `payment_transaction.created` | An ACH/money-movement payment is created | Record incoming/outgoing payments |
| `payment_transaction.updated` | A payment changes state | Mark settled/returned, trigger dunning |
| `dispute.updated` | A dispute advances | Progress dispute workflow, notify ops |
| `balance.updated` | A financial account balance changes | Refresh cached balances |
| `three_ds_authentication.created` | A 3DS authentication starts | Handle challenge/decisioning |

## Full Event List

Lithic emits many event types (`resource.action` form), including:

- `account_holder.created`, `account_holder.updated`, `account_holder.verification`
- `account_holder_document.updated`
- `auth_rules.backtest_report.created`
- `balance.updated`
- `book_transfer_transaction.created`, `book_transfer_transaction.updated`
- `card.converted`, `card.created`, `card.pin_updated`, `card.reissued`, `card.renewed`, `card.shipped`, `card.updated`
- `card_authorization.challenge`, `card_authorization.challenge_response`
- `card_transaction.enhanced_data.created`, `card_transaction.enhanced_data.updated`, `card_transaction.updated`
- `claim.created`, `claim.updated`
- `claim_document.uploaded`, `claim_document.accepted`, `claim_document.rejected`
- `digital_wallet.tokenization_result`, `digital_wallet.tokenization_updated`,
  `digital_wallet.tokenization_two_factor_authentication_code`, `digital_wallet.tokenization_two_factor_authentication_code_sent`
  (Lithic plans to deprecate these; use the `tokenization.*` names)
- `dispute.updated`, `dispute_evidence.upload_failed` (Chargebacks API only)
- `dispute_event.created` (programs on API version `2026-07-01` or later), `dispute_transaction.created`, `dispute_transaction.updated` (Managed Disputes)
- `embed.session_generated`, `embed.viewed`
- `external_bank_account.created`, `external_bank_account.updated`
- `external_payment.created`, `external_payment.updated`
- `financial_account.created`, `financial_account.updated`
- `funding_event.created`
- `internal_transaction.created`, `internal_transaction.updated`
- `loan_tape.created`, `loan_tape.updated`
- `management_operation.created`, `management_operation.updated`
- `network_total.created`, `network_total.updated`
- `payment_transaction.created`, `payment_transaction.updated`
- `settlement_report.updated`, `statements.created`
- `three_ds_authentication.challenge`, `three_ds_authentication.created`, `three_ds_authentication.updated`
- `tokenization.approval_request`, `tokenization.result`, `tokenization.updated`
- `tokenization.two_factor_authentication_code`, `tokenization.two_factor_authentication_code_sent`

For the authoritative, current list see Lithic's [Types of Events](https://docs.lithic.com/docs/types-of-events)
documentation. Auth Stream Access, 3DS decisioning and tokenization decisioning
requests are synchronous responder calls with their own setup and secret; they
aren't event subscriptions and this skill doesn't cover them.

## Delivery & Retries

- Lithic treats a non-`200` response as a failed attempt (another line on the
  same page says non-2XX), so answer `200`.
- Retry schedule, each step timed from the previous failure: immediately, then
  +5s, +5m, +30m, +2h, +5h, +10h, +10h. No retries after the 8th attempt.
- A subscription that fails for **5 days** in a row is disabled. Re-enable it with
  `PATCH /v1/event_subscriptions/{token}` and `"disabled": false`.
- Recover failed messages with `POST /v1/event_subscriptions/{token}/recover`,
  resend one event with `POST /v1/events/{event_token}/event_subscriptions/{token}/resend`,
  or replay messages a new endpoint missed with `.../replay_missing` (up to 90 days).
- Delivery is at least once and order isn't guaranteed. Deduplicate on
  `webhook-id`, and compare timestamps in the payload (such as `updated`) before
  overwriting newer state.
- Lithic doesn't publish a response timeout. Acknowledge fast and process
  asynchronously.
