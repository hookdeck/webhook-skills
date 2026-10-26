# Checkout Page Webhooks - FastAPI Example

Minimal example of receiving Checkout Page webhooks with signature verification.

## Prerequisites

- Python 3.9+
- Checkout Page account with a webhook signing secret

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

3. Add your Checkout Page signing secret to `.env` (Settings > Webhooks > View signing secret)

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. The webhook endpoint is `POST /webhooks/checkout-page`.

## Test

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally (no account required):

```bash
npx hookdeck-cli listen 8000 checkout-page --path /webhooks/checkout-page
```

Use the tunnel URL as the endpoint in Store settings > Integrations > Webhooks.
