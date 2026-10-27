# Terra API Webhooks - FastAPI Example

Minimal example of receiving Terra API webhooks with signature verification.

## Prerequisites

- Python 3.9+
- Terra account with a webhook destination and its signing secret

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

3. Add your Terra signing secret to `.env` (`TERRA_WEBHOOK_SECRET`). It is shown on the Connections page of the Terra dashboard.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

The handler reads the raw body with ``await request.body()`` and verifies the `terra-signature` header (`t=<unix seconds>,v1=<hex>`): HMAC-SHA256 of `<t>.<raw body>`. A missing, malformed or non-matching signature gets a `401`. The timestamp check is off by default because retries and replays keep the original timestamp; set `TERRA_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones. Events are dispatched on the body's `type` field.

## Test

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 terra-api --path /webhooks/terra-api
```

Use the Hookdeck URL as the webhook URL of your destination in the Terra dashboard. Terra expects a 2xx within 8 seconds.
