# RocketReach Webhooks - FastAPI Example

Minimal example of receiving RocketReach lookup webhooks with `X-RocketReach-Signature` HMAC verification.

## Prerequisites

- Python 3.9+
- A RocketReach webhook with a secret generated (API Usage & Settings > Generate Secret)

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put your webhook secret in `.env` as `ROCKETREACH_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000, endpoint `POST /webhooks/rocketreach`.

The route reads `await request.body()` so the signature is checked against the raw bytes.

## Receive webhooks locally

```bash
npx hookdeck-cli listen 8000 rocketreach --path /webhooks/rocketreach
```

Use the URL it prints as the webhook URL on the RocketReach API Usage & Settings page, then
click **Test Webhook**.

## Test

```bash
pytest test_webhook.py
```

The tests sign payloads the way RocketReach does (base64 HMAC-SHA256 of the raw body).
