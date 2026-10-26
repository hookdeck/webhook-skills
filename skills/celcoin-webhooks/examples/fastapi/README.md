# Celcoin Webhooks - FastAPI Example

Minimal example of receiving Celcoin webhooks and authenticating them with HTTP Basic auth. Celcoin does not sign payloads.

## Prerequisites

- Python 3.9+
- A Celcoin webhook subscription created with `auth.type` `basic` (see [references/setup.md](../../references/setup.md))

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

3. Put the `login` and `pwd` from your subscription into `.env` as `CELCOIN_WEBHOOK_USERNAME` and `CELCOIN_WEBHOOK_PASSWORD`.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts GET, POST, PUT, PATCH and DELETE on `/webhooks/celcoin`.

## Test

```bash
pytest test_webhook.py -v
```

To receive real notifications locally, tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 celcoin --path /webhooks/celcoin
```
