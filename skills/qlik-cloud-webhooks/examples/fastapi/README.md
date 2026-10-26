# Qlik Cloud Webhooks - FastAPI Example

Minimal example of receiving Qlik Cloud webhooks with FastAPI and verifying the `qlik-signature` header (hex HMAC-SHA256 of the raw body).

## Prerequisites

- Python 3.9+
- A Qlik Cloud webhook with a secret (32-64 characters). Without a secret Qlik Cloud sends no signature (see [references/setup.md](../../references/setup.md))

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

3. Put the webhook's secret into `.env` as `QLIK_CLOUD_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts GET, POST, PUT, PATCH and DELETE on `/webhooks/qlik-cloud`. A dependency reads `await request.body()` and verifies the exact bytes before the handler parses anything.

## Test

```bash
pytest test_webhook.py -v
```

To receive real events locally, tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 qlik-cloud --path /webhooks/qlik-cloud
```
