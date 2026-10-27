# Onramper Webhooks - FastAPI Example

Minimal example of receiving Onramper transaction status webhooks with signature verification.

## Prerequisites

- Python 3.9+
- An Onramper ApiKey with webhooks enabled by your Customer Success Manager (see [../../references/setup.md](../../references/setup.md))

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

3. Add the secret key Onramper issued to `.env` as `ONRAMPER_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts `POST /webhooks/onramper`.

## Test

```bash
pytest test_webhook.py
```

The tests sign payloads based on Onramper's documented sample with HMAC-SHA256 and cover valid, tampered, malformed and missing signatures plus all six statuses. No Onramper account is needed.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 8000 onramper --path /webhooks/onramper
```

Give the printed URL to your Onramper Customer Success Manager.

## How It Works

- `main.py`: `verify_onramper_signature()` and the `/webhooks/onramper` route, which reads the body with `await request.body()`.

1. The raw body bytes are hashed with HMAC-SHA256 keyed with `ONRAMPER_WEBHOOK_SECRET` and compared to `X-Onramper-Webhook-Signature` (64 hex characters, case-insensitive) with `hmac.compare_digest` on bytes. Failure returns `401`.
2. Only then is the body parsed as JSON (`400` if invalid).
3. The handler dispatches on `status` (`completed`, `paid`, `pending`, `new`, `failed`, `canceled`); `transactionType` is `buy` or `offramp`.
4. It returns `200 {"received": true}`.
