# Flutterwave Webhooks Overview

## What Are Flutterwave Webhooks?

Flutterwave sends a `POST` request with a JSON body to your webhook URL when an event happens on your account. They matter most for things your app doesn't control: mobile money and USSD payments, recurring charges, pending payments that later succeed, and payouts that settle after you initiate them.

There is one webhook URL per account, set under Settings > Webhooks. Two API versions are live side by side, and they differ in both the payload and the verification header:

| | v4 | v3 |
|--|----|----|
| Verification header | `flutterwave-signature` (HMAC) | `verif-hash` (the secret hash) |
| Secret hash | Required | Optional |
| Event field | `type` | `event` |
| Webhook ID | `webhook_id` (or `id` in the webhooks page sample), `wbk_...` | none |
| Timestamp | `timestamp`, Unix milliseconds | none |

Flutterwave's engineering blog (July 2025) says there are no plans to deprecate v3. Accounts on v3 see Public, Private and Encryption keys in the dashboard and can switch to v4 API keys there.

## v4 Payload

```json
{
  "webhook_id": "wbk_rp0bjKyAWA52ViM8xlZ0",
  "timestamp": 1739877172874,
  "type": "transfer.disburse",
  "data": {
    "id": "trf_yMZATJ11yVPNkZ",
    "type": "BANK",
    "source_currency": "NGN",
    "destination_currency": "NGN",
    "amount": 50000,
    "reference": "5748745ug8ufdgjhveyebjhcdbchb",
    "status": "SUCCESSFUL",
    "fee": { "currency": "NGN", "value": 500 },
    "meta": {}
  }
}
```

A `charge.completed` body carries the charge in `data`: `id` (`chg_...`), `amount`, `currency`, `customer`, `payment_method`, `processor_response`, `reference` and `status` (`succeeded`, ...). The webhooks page sample names the webhook ID `id`; the API reference schema and the payout pages name it `webhook_id`. Read both.

| v4 `type` | Fired when |
|-----------|------------|
| `charge.completed` | A charge reaches a final status (check `data.status`) |
| `transfer.disburse` | A transfer (payout) completes or fails |
| `transfer.reversal` | A transfer is reversed (named in the API reference) |
| `refund.completed` | A refund finishes: `data` has `id`, `amount_refunded`, `reason`, `status`, `charge_id` |
| `order.authorization` | Named in the API reference's `type` enum; no payload documented |

## v3 Payload

```json
{
  "event": "charge.completed",
  "data": {
    "id": 285959875,
    "tx_ref": "Links-616626414629",
    "flw_ref": "PeterEkene/FLW270177170",
    "amount": 100,
    "currency": "NGN",
    "charged_amount": 100,
    "status": "successful",
    "payment_type": "card",
    "customer": { "id": 215604089, "name": "Yemi Desola", "email": "user@gmail.com" }
  },
  "event.type": "CARD_TRANSACTION"
}
```

| v3 `event` | Fired when |
|------------|------------|
| `charge.completed` | A payment succeeds or fails (`data.status` is `successful` or `failed`) |
| `transfer.completed` | A transfer succeeds or fails, or a wallet is funded (`data.status` `SUCCESSFUL`/`FAILED`) |
| `subscription.cancelled` | A payment plan subscription is cancelled |
| `bvn.completed` | A BVN verification finishes |
| `singlebillpayment.status` | A bill payment completes |
| `chargeback.initiated`, `.accepted`, `.declined`, `.lost` | Chargeback lifecycle |
| `account.tokenize` | A direct debit account is tokenized |
| `quote.completed` | An FX quote completes |

Some v3 payloads **don't follow the structure**: virtual card debit and OTP notifications are flat objects (`TransactionId`, `CardId`, `Type`, `Status`, `Amount`, ...), and the refund sample is a flat refund record (`id`, `AmountRefunded`, `status`, `FlwRef`, ...). Handle them by shape, not by `event`.

## Delivery

- **Respond with `200`.** "Any other response codes, including 3xx codes, will be treated as a failure." Flutterwave ignores the response body and headers.
- **Timeout: 60 seconds.** Slower responses are failures.
- **Retries** happen only if you enable them in the dashboard: **3 retries, 30 minutes apart**.
- **Duplicates happen.** Dedupe on the v4 webhook ID. For v3, Flutterwave suggests a key of `event` + `data.id` + `data.status`.
- **Resending:** v4 has `POST /resend-webhook` (by `chg_`, `trf_`, `ord_` or `wbk_` ID); v3 has `POST /v3/transactions/{id}/resend-hook`.
- Flutterwave's IP addresses change, so don't allowlist IPs; verify the request instead.
- Exclude the route from CSRF protection (Rails, Django and similar frameworks).

## Re-Query Before Giving Value

Flutterwave's best practice: before fulfilling an order on a webhook, fetch the transaction from the API and confirm `status`, `amount`, `currency` and your reference match what you expect. Also poll pending transactions periodically, in case your endpoint was down.

## Full Reference

- [v4 webhooks](https://developer.flutterwave.com/v4/docs/webhooks) (rendered page; the `.md` URL serves the v3 text)
- [v3 webhooks](https://developer.flutterwave.com/docs/webhooks)
- [Full docs as text](https://developer.flutterwave.com/llms-full.txt) (includes the v4 webhooks section)
