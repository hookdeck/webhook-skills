# Logto Webhooks - FastAPI Example

Minimal example of receiving Logto webhooks with signature verification.

## Prerequisites

- Python 3.9+
- Logto webhook with a signing key (Logto Console > Webhooks)

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

3. Put the webhook's signing key in `.env` as `LOGTO_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and receives webhooks at `POST /webhooks/logto`.

## Test

```bash
pytest test_webhook.py
```

To receive real events locally (no account required):

```bash
npx hookdeck-cli listen 8000 logto --path /webhooks/logto
```

Use the URL the CLI prints as the webhook's **Endpoint URL** in Logto Console, then use **Send test payload** to try it.
