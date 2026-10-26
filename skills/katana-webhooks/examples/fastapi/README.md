# Katana Webhooks - FastAPI Example

Minimal example of receiving Katana MRP webhooks with `x-sha2-signature` verification (hex HMAC-SHA256 of the raw body).

## Prerequisites

- Python 3.9+
- A Katana webhook created through the API, and its `token`

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

3. Add the webhook's `token` to `.env` as `KATANA_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. The endpoint `/webhooks/katana` accepts GET, POST, PUT, PATCH and DELETE
(Katana's docs don't name the method) and reads the raw bytes with `await request.body()`.

To receive webhooks locally:

```bash
npx hookdeck-cli listen 8000 katana --path /webhooks/katana
```

Hookdeck's Katana MRP source pre-selects POST without managing the method, so allow any other method Katana uses.

## Test

```bash
pytest test_webhook.py
```
