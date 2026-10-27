# OxaPay Webhooks Overview

## What Are OxaPay Webhooks?

OxaPay is a crypto payment gateway. Merchants pass a `callback_url` on a payment request (invoice, white-label, static address, payment link, donation) or a payout request. When the transaction's state changes, OxaPay sends a `POST` with a JSON body to that URL. Callbacks are not sent to private networks such as localhost, and OxaPay sends the callback even when a request could not be processed.

There is no event name and no event header: each callback is the transaction's current state, and the body's `status` says what happened.

## Common Event Types

| `status` | Flow | Triggered When | Common Use Cases |
|----------|------|----------------|------------------|
| `Paying` | Payment | Payer transferred funds; awaiting network confirmation | Mark the order as in progress; do not deliver yet |
| `Paid` | Payment | Network confirmed and the merchant was credited | Fulfil the order, grant access |
| `Confirming` | Payout | Payout sent; awaiting network confirmation | Mark the payout as sent |
| `Confirmed` | Payout | Payout confirmed by the network | Mark the payout as completed |
| `Failed` | Payout | Payout failed | Alert, release or retry |

You first receive `Paying`, then must wait for a second callback with `Paid`. The docs' examples capitalise the status; their prose writes "paying" and "paid". Match the documented spelling and log anything unfamiliar.

## Event Payload Structure

`type` says which flow produced the callback: `invoice`, `white_label`, `static_address`, `payment_link`, `donation` (payments) or `payout`.

Payment callback (abridged):

```json
{
  "track_id": "151811887",
  "status": "Paid",
  "type": "invoice",
  "module_name": "OxaPay",
  "amount": 10,
  "value": 3.6839,
  "sent_value": 3.6839,
  "currency": "POL",
  "order_id": "ORD-12345",
  "email": "customer@oxapay.com",
  "fee_paid_by_payer": 0,
  "under_paid_coverage": 0,
  "description": "Test Description",
  "date": 1738493900,
  "txs": [{ "status": "confirmed", "tx_hash": "x", "network": "Polygon Network", "received_amount": 9.85, "confirmations": 250 }]
}
```

Payout callback (abridged):

```json
{
  "track_id": "227296189",
  "status": "Confirmed",
  "type": "payout",
  "tx_hash": "x",
  "address": "x",
  "amount": 10.0,
  "value": 4.01,
  "currency": "POL",
  "network": "Polygon Network",
  "description": "Order #12345",
  "date": 1738492316
}
```

For payouts the `address` value differs between callbacks. Payment `txs[].status` values are lowercase (`confirming`, `confirmed`).

## Delivery and Retries

A delivery succeeds only if your endpoint returns **HTTP 200 with the body `ok`**. OxaPay makes up to 5 attempts: the second about 1 minute after the first, the third 3 minutes later, the fourth 30 minutes later and the last 3 hours later. Make handlers idempotent (key on `track_id` + `status`).

## Full Event Reference

See [OxaPay's webhook documentation](https://docs.oxapay.com/webhook).
