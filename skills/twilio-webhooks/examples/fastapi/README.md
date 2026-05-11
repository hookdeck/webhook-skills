# Twilio Webhooks - FastAPI Example

Twilio webhook receiver implemented with FastAPI, using the official [`twilio` Python SDK](https://pypi.org/project/twilio/)'s `RequestValidator` for signature verification.

## Prerequisites

- Python 3.10+
- A Twilio account and Auth Token

## Setup

1. Create a virtual environment and install dependencies:

   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

3. Set `TWILIO_AUTH_TOKEN` (and optionally `WEBHOOK_BASE_URL`) in `.env`.

## Run

```bash
uvicorn main:app --reload --port 3000
```

The webhook endpoint is `POST /webhooks/twilio`. A health check is exposed at `GET /health`.

## Test

```bash
pytest test_webhook.py -v
```

The tests build real Twilio signatures with HMAC-SHA1 + base64 and verify both the standalone function and the route against valid, missing, invalid, tampered, and wrong-secret cases for incoming SMS, voice, message status, call status, and recording status webhooks.

## URL reconstruction behind proxies

Twilio signs the **exact URL** you configured in the Console. If your app runs behind a proxy (Cloudflare, Vercel, Hookdeck, etc.), the request URL FastAPI sees may differ. The example handler:

1. Prefers `WEBHOOK_BASE_URL` when set (most reliable).
2. Falls back to constructing the URL from `x-forwarded-proto` / `x-forwarded-host`.
3. Finally falls back to `request.url` directly.
