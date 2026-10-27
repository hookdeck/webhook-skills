# BlindPay Webhooks - FastAPI Example

Minimal example of receiving BlindPay webhooks with signature verification using the
official [`svix`](https://pypi.org/project/svix/) library (BlindPay delivers webhooks through Svix).

## Prerequisites

- Python 3.9+
- A BlindPay instance with a webhook endpoint and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your BlindPay webhook secret to `.env` as `BLINDPAY_WEBHOOK_SECRET` (the full
   `whsec_...` value from the endpoint's **Get secret** menu item or the `/secret` API).

## Run

```bash
python main.py
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/blindpay
```

## Test

```bash
pytest test_webhook.py -v
```

The tests sign requests with the same HMAC-SHA256 algorithm Svix uses
(`{svix-id}.{svix-timestamp}.{raw body}`), including deliveries that carry the `webhook-*`
header names instead of `svix-*`.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 blindpay --path /webhooks/blindpay
```

1. In the [BlindPay dashboard](https://app.blindpay.com), open your instance's **Webhooks** tab
   (or `POST /v1/instances/{instance}/webhook-endpoints`) and add the tunnel URL as an endpoint.
2. Fetch the endpoint's signing secret and copy it into `.env`.

## Event Handling

The body is flat: `webhook_event` holds the event name, followed by the resource's own fields.
The handler routes on `webhook_event` and acknowledges anything else with `200`:

- `customer.new`, `customer.update`, `customer.delete`
- `bankAccount.new`, `blockchainWallet.new`, `blockchainWallet.update`, `tos.accept`
- `payin.new`, `payin.update`, `payin.complete`
- `payout.new`, `payout.update`, `payout.complete`
- `virtualAccount.new`, `virtualAccount.complete`
- `transfer.new`, `transfer.update`, `transfer.complete`
- `wallet.new`, `wallet.update`, `wallet.inbound`
- `limitIncrease.new`, `limitIncrease.update`
- `payable.new`, `payable.update`, `payable.complete`

`svix-id` is stable across retries and replays, so deduplicate on it before acting twice.

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
