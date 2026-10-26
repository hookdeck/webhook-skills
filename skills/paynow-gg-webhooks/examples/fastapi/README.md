# PayNow Webhooks - FastAPI Example

Minimal example of receiving PayNow (paynow.gg) webhooks with signature verification.

## Prerequisites

- Python 3.10+
- A PayNow store with a JSON (v1) webhook and its signing secret

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

3. Add your PayNow webhook signing secret to `.env` as `PAYNOW_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000, with the webhook at `POST /webhooks/paynow-gg`.

## Test

```bash
pytest test_webhook.py
```

The tests sign payloads the way PayNow does (`base64(HMAC-SHA256(secret, "<PayNow-Timestamp>.<raw body>"))`).

To receive real webhooks locally, run the Hookdeck CLI (no account needed) and set the printed URL as the webhook URL in PayNow:

```bash
npx hookdeck-cli listen 8000 paynow-gg --path /webhooks/paynow-gg
```

## Notes

- The `verified_body` dependency reads `await request.body()` (raw bytes) and rejects the request before the handler runs. JSON is parsed only after the signature passes.
- Old timestamps are not rejected by default. To opt in, set `PAYNOW_WEBHOOK_TOLERANCE_SECONDS` (`PayNow-Timestamp` is Unix milliseconds).
