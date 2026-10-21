# Onfido Webhooks - FastAPI Example

Minimal example of receiving Onfido (Entrust Identity Verification) webhooks with signature verification. Onfido's Python client doesn't expose a webhook verifier, so this example verifies `X-SHA2-Signature` manually (HMAC-SHA256 hex of the raw body).

## Prerequisites

- Python 3.9+
- Onfido account with a registered webhook and its webhook token

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

3. Add your webhook token (the `token` field returned when the webhook was registered, or from the Dashboard "Webhook Management" page) to `.env` as `ONFIDO_WEBHOOK_TOKEN`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 8000 onfido --path /webhooks/onfido
```

Use the Hookdeck URL as the webhook URL in Onfido (it must be HTTPS).

## Test

```bash
pytest test_webhook.py -v
```

Tests generate real `X-SHA2-Signature` values (HMAC-SHA256 hex of the raw body, keyed with the token).
