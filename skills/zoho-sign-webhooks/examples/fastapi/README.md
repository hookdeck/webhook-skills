# Zoho Sign Webhooks - FastAPI Example

Minimal example of receiving Zoho Sign webhooks with `X-ZS-WEBHOOK-SIGNATURE` HMAC verification.

## Prerequisites

- Python 3.9+
- A Zoho Sign webhook with the HMAC signature checkbox enabled and its secret key saved

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

3. Put your webhook secret key in `.env` as `ZOHO_SIGN_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000, endpoint `POST /webhooks/zoho-sign`. The handler reads
`await request.body()` so the signature is checked against the raw bytes.

## Receive webhooks locally

```bash
npx hookdeck-cli listen 8000 zoho-sign --path /webhooks/zoho-sign
```

Use the URL it prints as the callback URL in Zoho Sign (Settings > Developer Settings > Webhooks).

## Test

```bash
pytest test_webhook.py
```

The tests sign payloads the way Zoho Sign does and also check the sample from Zoho's docs.
