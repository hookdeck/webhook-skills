# Duffel Webhooks - FastAPI Example

Minimal example of receiving Duffel webhooks with `X-Duffel-Signature` verification.

## Prerequisites

- Python 3.9+
- Duffel account with a webhook created via the API (its `secret` is returned once)

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

3. Add your Duffel webhook secret to `.env` (`DUFFEL_WEBHOOK_SECRET`). Use it exactly as returned; don't base64-decode it.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

The handler reads the raw body before parsing and checks `v1` = HMAC-SHA256 (hex) of `<t>.<raw body>`. The timestamp check is off by default because retries and replays keep the original timestamp; set `DUFFEL_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
pytest test_webhook.py
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 duffel --path /webhooks/duffel
```

Use the Hookdeck URL as the `url` when creating the webhook, then trigger a `ping.triggered` event with `POST /air/webhooks/id/{id}/actions/ping`.
