# ComplyCube Webhooks - FastAPI Example

Minimal example of receiving ComplyCube webhooks with signature verification.

## Prerequisites

- Python 3.10+
- A ComplyCube account and a webhook endpoint (its secret is shown once, at creation)

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
3. Add your webhook secret to `.env` as `COMPLYCUBE_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 complycube --path /webhooks/complycube
```

Then register the Hookdeck URL as a webhook endpoint in ComplyCube (it must be HTTPS). The handler
reads `await request.body()` so the signature covers the exact bytes received.
