# Breezy HR Webhooks - FastAPI Example

Minimal example of receiving Breezy HR webhooks with signature verification.

## Prerequisites

- Python 3.9+
- Breezy HR Pro account with a webhook endpoint and its signing secret (`whsec_...`)

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

3. Add your Breezy HR webhook secret to `.env` as `BREEZY_HR_WEBHOOK_SECRET`. Keep
   the `whsec_` prefix: the whole string is the HMAC key.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000, webhook route `POST /webhooks/breezy-hr`.

## Receive Webhooks Locally

Breezy only accepts public HTTPS URLs, so use a tunnel:

```bash
npx hookdeck-cli listen 8000 breezy-hr --path /webhooks/breezy-hr
```

Register the URL it prints as your Breezy webhook endpoint (see
[setup](../../references/setup.md)), then add a candidate to a position.

## Test

```bash
pytest test_webhook.py -v
```

Tests sign payloads with HMAC-SHA256 (hex) over the raw body, keyed with the
whole `whsec_` secret.
