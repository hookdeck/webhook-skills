# Sendcloud Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Sendcloud](https://www.sendcloud.com) webhooks with `Sendcloud-Signature` (HMAC-SHA256) verification. The handler reads the raw bytes with `await request.body()` so any content type verifies.

## Prerequisites

- Python 3.9+
- A Sendcloud API integration and its Secret Key or Webhook Signature Key

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

3. Put your integration's Secret Key or Webhook Signature Key in `SENDCLOUD_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/sendcloud`.

## Test

```bash
pytest test_webhook.py
```

The tests sign bodies with HMAC-SHA256 (including the docs test vector) and cover tampering, wrong secrets, missing headers, non-JSON content types and the fail-closed path.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 sendcloud --path /webhooks/sendcloud
```

Set the printed URL as **Webhook url** in **Settings > Integrations**, then click **Test API webhook**.
