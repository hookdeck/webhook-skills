# BILL Webhooks - FastAPI Example

Minimal FastAPI example of receiving [BILL](https://www.bill.com) (Bill.com) webhooks and verifying the `x-bill-sha-signature` HMAC.

## Prerequisites

- Python 3.9+
- A BILL developer account (the sandbox is free) and a Connect Events subscription (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `BILL_WEBHOOK_SECURITY_KEY` in `.env` to the subscription's `securityKey`, as-is.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/bill-com` in [main.py](main.py).

## Test

```bash
pytest test_webhook.py -v
```

The tests cover a valid signature over BILL's test notification, a hex digest (rejected), a pretty-printed copy of the body (rejected), a `bill.created` event, another key, a tampered body, a missing header, a trailing newline in the key, invalid JSON, and a missing key.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 bill-com --path /webhooks/bill-com
```

Create a sandbox subscription with the printed URL as `notificationUrl`, then send a signed test with `POST /v3/subscriptions/{subscriptionId}/test`.

## Notes

- The handler reads `await request.body()` before parsing. BILL signs the compact body it sends, so don't parse and re-serialise it first.
- BILL treats anything but HTTP `200` within 10 seconds as a failure.
