# Kustomer Webhooks - FastAPI Example

Minimal example of receiving Kustomer outbound webhooks with signature verification (`X-Kustomer-Webhook-Signature`, hex HMAC-SHA256 of the raw body).

## Prerequisites

- Python 3.9+
- Kustomer account with an outbound webhook and its secret (`token`)

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

3. Add your outbound webhook's secret to `.env` as `KUSTOMER_WEBHOOK_SECRET`. In Kustomer it is under **Settings > Platform > Outbound webhooks > Edit > Header Information** (available after the first save).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000, endpoint `POST /webhooks/kustomer`.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 8000 kustomer --path /webhooks/kustomer
```

Use the URL it prints as the webhook's Destination URL in Kustomer.

## Test

```bash
pytest test_webhook.py
```

Tests sign payloads with HMAC-SHA256 using the same algorithm as Kustomer. To trigger a real event, create or update a customer or conversation in your Kustomer org.
