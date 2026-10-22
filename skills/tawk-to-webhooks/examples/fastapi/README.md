# tawk.to Webhooks - FastAPI Example

Minimal example of receiving tawk.to webhooks with `X-Tawk-Signature` (HMAC-SHA1) verification.

## Prerequisites

- Python 3.10+
- tawk.to account with a webhook secret key

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
3. Add your webhook secret key to `.env` as `TAWK_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts `POST /webhooks/tawk-to`.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 8000 tawk-to --path /webhooks/tawk-to
```

Use the printed URL as the webhook URL in the tawk.to dashboard (`Admin` section).

## Test

```bash
pytest test_webhook.py
```
