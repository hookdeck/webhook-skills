# Delivereasy Webhooks - FastAPI Example

Minimal example of receiving Delivereasy Lastmile webhooks with signature verification.

> Only Lastmile webhooks are supported: paste your Delivereasy API key. Marketplace webhooks (X-Delivereasy-Signature) aren't covered.

## Prerequisites

- Python 3.9+
- A Delivereasy Lastmile account and its API key (the HMAC key)

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
3. Put your Delivereasy API key in `.env` as `DELIVEREASY_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000, endpoint `POST /webhooks/delivereasy`.

## Test

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally (a Delivereasy representative configures the URL):

```bash
npx hookdeck-cli listen 8000 delivereasy --path /webhooks/delivereasy
```
