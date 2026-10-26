# PayTabs Webhooks - FastAPI Example

Minimal example of receiving PayTabs callback and IPN webhooks with `Signature` (hex HMAC-SHA256 of the raw body) verification.

## Prerequisites

- Python 3.9+
- A PayTabs profile ServerKey

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your profile ServerKey to `.env` as `PAYTABS_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and the route is `POST /webhooks/paytabs`.

## Test

```bash
pytest test_webhook.py
```

To receive real events locally, run the Hookdeck CLI in another terminal and use the URL it prints as your callback or IPN URL:

```bash
npx hookdeck-cli listen 8000 paytabs --path /webhooks/paytabs
```
