# NextPay Webhooks Overview

## What Are NextPay Webhooks?

[NextPay's NextAPI](https://nextpay.world) is a Philippine payments API for collections (QRPH,
cards, payment intents), payouts and platform wallets. It sends an HTTPS `POST` to a URL you
register when a payment, payout or account event happens, so you don't have to poll. Deliveries
go through Svix and are signed (see [verification.md](verification.md)).

| Aspect | Value |
|--------|-------|
| Method | `POST`, JSON body |
| Signature headers | `svix-id`, `svix-timestamp`, `svix-signature` (Standard Webhooks) |
| Success | Any `2xx` within 30 seconds |
| Retries | `5xx` and timeouts are retried with exponential backoff; `4xx` is not retried |
| Delivery | At-least-once. Deduplicate on `svix-id` (the docs say the event `id`). Ordering is not stated |

## Event Payload Structure

There are two body shapes, chosen by event category. NextPay's own handler reads
`event.event || event.type`.

`v2.*` payment events use `event` and `payload`:

```json
{
  "event": "v2.payment_intent.succeeded",
  "payload": {
    "id": "...",
    "account_id": "...",
    "amount": 150000,
    "external_id": "order-98765",
    "status": "succeeded"
  }
}
```

Payout and platform events use `type` and `data`:

```json
{
  "type": "payout_request.processed",
  "data": {
    "id": "...",
    "source_account_id": "...",
    "amount_cents": 50000,
    "status": "completed"
  }
}
```

| Field | Meaning |
|-------|---------|
| `event` | Event name for `v2.*` events |
| `type` | Event name for payout and platform events |
| `payload` | The resource for `v2.*` events |
| `data` | The resource for payout and platform events |

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `v2.payment_intent.succeeded` | Payment received and settled | Fulfil the order via `payload.external_id` |
| `v2.payment_intent.canceled` | A payment intent was cancelled | Release reserved stock |
| `v2.payment_instrument.used` | A single-use Funding Method instrument was used | Mark the instrument consumed |
| `v2.payment_instrument.payment_received` | An incoming Funding Method payment arrived | Show a pending payment |
| `v2.payment_instrument.payment_settled` | That incoming payment cleared | Credit the customer |
| `payout_request.creation_failed` | A payout request failed to create | Alert and retry |
| `payout_request.queued` | A payout request is queued for settlement | Progress display |
| `payout_request.queue_failed` | A payout request failed to queue | Alert and retry |
| `payout_request.processed` | A payout request is fully processed | Mark the batch done |
| `payout.succeeded` | An individual payout was delivered | Confirm to the payee |
| `payout.failed` | An individual payout failed | Notify and reconcile |
| `payout.processed` | An individual payout finished processing | Progress display |
| `payout.processing_failed` | An individual payout failed during processing | Notify and reconcile |
| `deposit.confirmed` | An inbound deposit was confirmed on an account | Credit the ledger |
| `direct_transfer.received` | An account received a direct transfer | Credit the ledger |
| `legal_entity.verification_status_changed` | A merchant KYC/compliance status changed | Unlock or restrict features |

The examples handle exactly these 16 events and acknowledge anything else with `200`. The list
may not be exhaustive.

## Delivery and Retries

NextPay documents these attempts: immediate, then after 1 minute, 5 minutes, 30 minutes and
2 hours (about 2.5 hours cumulative). A `2xx` ends the sequence, a `4xx` is not retried, and a
`5xx` or a response slower than 30 seconds is retried. Retries of one message share
its `svix-id`, so that is the key to deduplicate on. Hookdeck retries and replays resend the original
timestamp (see [verification.md](verification.md)).

## Full Event Reference

See NextPay's [Understanding Webhooks](https://developers.nextpay.world/docs/concepts/webhooks)
page for every payload shape.
