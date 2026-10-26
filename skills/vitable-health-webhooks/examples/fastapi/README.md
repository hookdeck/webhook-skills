# Vitable Health Webhooks - FastAPI Example

Minimal example of receiving Vitable Health webhooks with signature verification.

## Prerequisites

- Python 3.9+
- A Vitable Health webhook subscription and its secret key (Vitable's team provides it on request)

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

3. Add your subscription's secret key to `.env` (`VITABLE_WEBHOOK_SECRET`)

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

Vitable signs `<X-Vitable-Timestamp>.<raw body>` with HMAC-SHA512 and sends `X-Vitable-Signature: sha512=<hex>`. There is no SDK, so the handler verifies manually in a FastAPI dependency that reads `await request.body()` (the exact bytes, whatever the content type) and parses JSON only after the check. Failures return `401`. Duplicate deliveries are skipped by `event_id`. The timestamp check is off by default because retries and replays keep the original timestamp; set `VITABLE_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds (Vitable's examples use 300) to reject older ones.

## Test

```bash
pytest test_webhook.py
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 vitable-health --path /webhooks/vitable-health
```

Give the Hookdeck URL to Vitable as your webhook endpoint.
