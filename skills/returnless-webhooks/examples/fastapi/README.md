# Returnless Webhooks - FastAPI Example

Minimal example of receiving Returnless webhooks with signature verification (`X-Signature`, lowercase hex HMAC-SHA256 of the raw body).

## Prerequisites

- Python 3.9+
- A Returnless webhook with its signing secret

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

3. Add your Returnless webhook signing secret to `.env` as `RETURNLESS_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 8000 returnless --path /webhooks/returnless
```

Use the URL the CLI prints as the endpoint in Returnless (Integrations -> Webhooks).

## Test

```bash
pytest test_webhook.py
```

The tests sign requests with the same algorithm Returnless uses. The event name is read from the `X-Event-Name` header.
