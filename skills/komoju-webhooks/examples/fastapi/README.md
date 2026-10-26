# KOMOJU Webhooks - FastAPI Example

Minimal example of receiving KOMOJU webhooks with signature verification.

## Prerequisites

- Python 3.9+
- A KOMOJU account with a webhook that has a secret token set (Manage > Webhooks)

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
3. Add the webhook's secret token to `.env` as `KOMOJU_WEBHOOK_SECRET`. Set a secret token on the KOMOJU webhook. Without one, deliveries are unsigned and fail verification.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 komoju --path /webhooks/komoju
```

Then add the Hookdeck URL as the webhook URL in KOMOJU (Manage > Webhooks). The handler reads `await request.body()` so the exact bytes are verified against `X-Komoju-Signature` before the JSON is parsed, and dedupes on the event `id`.
