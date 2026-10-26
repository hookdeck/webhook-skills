# Uploadcare Webhooks - FastAPI Example

Minimal example of receiving Uploadcare webhooks with `X-Uc-Signature` verification.

## Prerequisites

- Python 3.9+
- An Uploadcare project with a webhook that has a `signing_secret`

> Set a signing_secret on the Uploadcare webhook. Without one, deliveries are unsigned and fail verification.

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

3. Put the webhook's signing secret in `.env` as `UPLOADCARE_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts `POST /webhooks/uploadcare`.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 8000 uploadcare --path /webhooks/uploadcare
```

Use the printed URL as the webhook's target URL in Uploadcare, then upload a file to trigger `file.uploaded`.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads with HMAC-SHA256 the way Uploadcare does (`v1=` + hex of the raw body).
