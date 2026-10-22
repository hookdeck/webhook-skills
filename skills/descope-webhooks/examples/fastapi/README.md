# Descope Webhooks - FastAPI Example

Minimal example of receiving Descope Audit Webhook connector events with signature verification.

## Prerequisites

- Python 3.9+
- Descope project with an Audit Webhook connector and an HMAC Secret

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

3. Put the connector's HMAC Secret in `.env` as `DESCOPE_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and receives webhooks at `POST /webhooks/descope`.

## Test

```bash
pytest test_webhook.py
```

To receive real events locally (no account required):

```bash
npx hookdeck-cli listen 8000 descope --path /webhooks/descope
```

Use the URL the CLI prints as the connector's **Base URL**. Descope delivers audit events in batches after a delay of a few minutes, so don't expect instant delivery.
