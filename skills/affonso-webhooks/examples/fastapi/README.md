# Affonso Webhooks - FastAPI Example

Minimal example of receiving Affonso webhooks with signature verification.

## Prerequisites

- Python 3.9+
- Affonso account with an affiliate program and a webhook endpoint (with its signing secret)

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

3. Add your Affonso signing secret to `.env` (`AFFONSO_WEBHOOK_SECRET`). It is a 64-character hex string, shown once when you create the endpoint.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

The handler reads the raw body with `await request.body()` (in a dependency) and verifies `X-Affonso-Signature` (lowercase hex HMAC-SHA256, no prefix) over `<X-Affonso-Timestamp>.<raw body>`, keyed with the secret as a plain string (not hex-decoded). Failures return 401. The timestamp check is off by default because retries and replays keep the original timestamp; set `AFFONSO_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 affonso --path /webhooks/affonso
```

Use the Hookdeck URL as the endpoint URL in Affonso → Settings → Webhooks → Add Endpoint, then use **Send Test Event**.
