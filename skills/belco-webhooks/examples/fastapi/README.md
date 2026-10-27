# Belco Webhooks - FastAPI Example

Minimal example of receiving Belco webhooks with signature verification.

## Prerequisites

- Python 3.9+
- A Belco account with a webhook created through the API (its `secret` is the signing secret)

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
3. Add the webhook's `secret` (the `secret` property returned by `POST /webhooks`) to `.env`

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
npx hookdeck-cli listen 8000 belco --path /webhooks/belco
```

Then use the Hookdeck URL as the `url` when creating the webhook with `POST /webhooks`. The handler
reads `await request.body()` so the exact bytes are verified against `x-hook-signature` before the
JSON is parsed, and dedupes on `requestId`.
