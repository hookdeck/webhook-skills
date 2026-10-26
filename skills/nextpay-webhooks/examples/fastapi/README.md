# NextPay Webhooks - FastAPI Example

Minimal example of receiving NextPay webhooks with signature
verification using the official [`svix`](https://pypi.org/project/svix/) library
(NextPay delivers webhooks through Svix).

## Prerequisites

- Python 3.9+
- A NextPay webhook registered via `POST /v2/webhooks` and its signing secret (`whsec_...`), shown once in the response

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your NextPay signing secret to `.env` as `NEXTPAY_WEBHOOK_SECRET`. It is the
   `secret` returned by `POST /v2/webhooks`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/nextpay
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
npx hookdeck-cli listen 8000 nextpay --path /webhooks/nextpay
```

1. Register the tunnel URL with `POST /v2/webhooks` and the `events` you want, e.g.
   `["v2.payment_intent.succeeded", "payout_request.processed", "payout.failed"]`.
2. Copy the returned `secret` into `.env`.

## Event Handling

The handler reads the event name as `event.event || event.type` (`v2.*` events are
`{event, payload}`, payout and platform events are `{type, data}`), routes these events, and
acknowledges anything else with `200`:

- `v2.payment_intent.succeeded`, `v2.payment_intent.canceled`, `v2.payment_instrument.used`, `v2.payment_instrument.payment_received`, `v2.payment_instrument.payment_settled` (body: `event` + `payload`)
- `payout_request.creation_failed`, `payout_request.queued`, `payout_request.queue_failed`, `payout_request.processed`
- `payout.succeeded`, `payout.failed`, `payout.processed`, `payout.processing_failed`
- `deposit.confirmed`, `direct_transfer.received`, `legal_entity.verification_status_changed` (body: `type` + `data`)
