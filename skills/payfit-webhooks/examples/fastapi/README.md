# PayFit Webhooks - FastAPI Example

Minimal FastAPI example of receiving [PayFit](https://payfit.com) webhooks and verifying the Svix `svix-signature` HMAC.

## Prerequisites

- Python 3.9+
- PayFit partner credentials with webhook access enabled (see [setup](../../references/setup.md))

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

3. Set `PAYFIT_WEBHOOK_SECRET` in `.env` to the endpoint's `whsec_…` signing secret. `PAYFIT_WEBHOOK_TOLERANCE_SECONDS` is optional.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/payfit` in [main.py](main.py).

## Test

```bash
pytest test_webhook.py -v
```

The tests cover Svix's published example, several `v1` entries during a rotation, the optional timestamp window, a valid signature, an integration event, the secret used as UTF-8 text (rejected), the secret without `whsec_`, another secret, a tampered body, each missing header, an old timestamp with the window on, invalid JSON, and a missing or non-base64 secret.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 payfit --path /webhooks/payfit
```

Add the printed URL as an endpoint in the PayFit webhooks dashboard, copy its signing secret, and send a test event.

## Notes

- The handler reads `await request.body()` before parsing. The HMAC covers the exact raw body, so don't parse and re-serialise it first.
- The key is the base64-decoded secret, not the `whsec_…` string. A secret that isn't valid base64 gets a `500`.
