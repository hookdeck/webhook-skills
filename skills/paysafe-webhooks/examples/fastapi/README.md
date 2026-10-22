# Paysafe Webhooks - FastAPI Example

Minimal example of receiving Paysafe Payments API webhooks with signature verification.

## Prerequisites

- Python 3.10+
- Paysafe account with a webhook configured in the Business Portal (provides the HMAC key)

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

3. Add your Paysafe HMAC key to `.env` as `PAYSAFE_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

### Receive real webhooks locally with the Hookdeck CLI

```bash
npx hookdeck-cli listen 8000 paysafe --path /webhooks/paysafe
```

Then use the Hookdeck URL as the webhook URL in the Paysafe Business Portal.

## Endpoint

- `POST /webhooks/paysafe` - Verifies the `Signature` header (base64 HMAC-SHA256 of the raw body) and dispatches on `eventName`
