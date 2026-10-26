# Simpro Webhooks - FastAPI Example

Minimal example of receiving Simpro webhooks with `X-Response-Signature` (HMAC-SHA1 hex) verification.

## Prerequisites

- Python 3.9+
- A Simpro webhook subscription with a Secret

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

3. Set the Secret on the Simpro webhook subscription to a long random value, then put the same value in `.env` as `SIMPRO_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

For a live test, expose the endpoint and click **Test Subscription** in Simpro (sends `test.updated`):

```bash
npx hookdeck-cli listen 8000 simpro --path /webhooks/simpro
```
