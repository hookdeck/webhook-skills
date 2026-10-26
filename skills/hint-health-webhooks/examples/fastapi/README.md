# Hint Health Webhooks - FastAPI Example

Minimal example of receiving Hint Health webhooks with `X-Hint-Signature` (`sha256=` + hex HMAC-SHA256 of the raw body) verification.

## Prerequisites

- Python 3.10+
- A Hint Health partner API key chosen as the webhooks signature key

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

3. Add your webhooks signature key to `.env` as `HINT_HEALTH_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and the route is `POST /webhooks/hint-health`.

## Test

```bash
pytest test_webhook.py
```

To receive real events locally, run the Hookdeck CLI in another terminal and use the URL it prints as your webhook URL:

```bash
npx hookdeck-cli listen 8000 hint-health --path /webhooks/hint-health
```
