# Convox Webhooks - FastAPI Example

Minimal example of receiving Convox webhooks with `Convox-Signature` verification.

## Prerequisites

- Python 3.9+
- A Convox Rack on 3.24.6 or later with the `webhook_signing_key` Rack parameter set

> Signing is opt-in: set the webhook_signing_key rack parameter (Rack 3.24.6 or later) and paste the same value. Without it, deliveries are unsigned and fail verification.

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

3. Add your signing key to `.env` as `CONVOX_WEBHOOK_SECRET`. Use it exactly as you set it on the Rack; don't hex-decode it.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

The handler reads the raw body with `await request.body()` before parsing and checks any `v1` entry in `Convox-Signature` against the hex HMAC-SHA256 of `<t>.<raw body>`. The timestamp check is off by default because retries and replays keep the original timestamp; set `CONVOX_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
pytest test_webhook.py
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 convox --path /webhooks/convox
```

Use the Hookdeck URL as the webhook URL in Console under App > Settings > Webhooks.
