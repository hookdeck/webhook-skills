# Yousign Webhooks - FastAPI Example

Minimal example of receiving Yousign webhooks with signature verification (`X-Yousign-Signature-256`, HMAC-SHA256 of the raw body).

## Prerequisites

- Python 3.10+
- Yousign account with a webhook subscription (its secret key)

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

3. Add your webhook subscription secret to `.env` as `YOUSIGN_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000, endpoint `POST /webhooks/yousign`.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 8000 yousign --path /webhooks/yousign
```

Use the Hookdeck URL as the endpoint of your Yousign webhook subscription (sandbox is fine for testing).

## Test

```bash
pytest test_webhook.py
```
