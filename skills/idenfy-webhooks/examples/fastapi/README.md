# iDenfy Webhooks - FastAPI Example

Minimal example of receiving iDenfy webhooks with FastAPI and verifying the `Idenfy-Signature`
header (HMAC-SHA256 of the raw body, lowercase hex).

## Prerequisites

- Python 3.9+
- An iDenfy account with a webhook that has a signing key (Settings → System notifications →
  the webhook → Headers → Signing key; see [../../references/setup.md](../../references/setup.md))

## Setup

1. Create a virtualenv and install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `IDENFY_WEBHOOK_SECRET` to the signing key you set on the webhook.

## Run

```bash
python main.py
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/idenfy`.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads with the same algorithm iDenfy uses and cover valid, tampered,
wrong-secret, malformed and missing signatures, any content type, and the handled events.

## Receive iDenfy Webhooks Locally

```bash
npx hookdeck-cli listen 8000 idenfy --path /webhooks/idenfy
```

## How It Works

1. `await request.body()` returns the exact bytes received, whatever the content type.
2. `Idenfy-Signature` is compared (as bytes, constant-time) with the lowercase hex
   HMAC-SHA256 of the body; mismatch or missing header returns `401`.
3. The body must be a JSON object (`400` otherwise).
4. The handler dispatches on the `Idenfy-Event-Type` header (`IDENTIFICATION_AUTO_FINISHED`,
   `IDENTIFICATION_MANUAL_FINISHED`, `IDENTIFICATION_EXPIRED`, `IDENTIFICATION_CANCELLED`,
   `COMPANY_REVIEW`, `AML_MONITORING`) and returns `{"received": true}`.
