# Typefully Webhooks - FastAPI Example

Minimal example of receiving Typefully webhooks with signature verification.

## Prerequisites

- Python 3.9+
- Typefully account with API access and a webhook secret

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

3. Add your Typefully webhook secret to `.env` (`TYPEFULLY_WEBHOOK_SECRET`), from your Typefully API settings.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

The handler reads the raw body with `await request.body()` and verifies `X-Typefully-Signature` (`sha256=<hex>`): HMAC-SHA256 of `<X-Typefully-Timestamp>.<raw body>`, keyed with the secret. A missing, malformed or wrong signature gets a `401`. The timestamp check is off by default because Hookdeck's retries and replays keep the original timestamp (Typefully doesn't document whether its own retries do); set `TYPEFULLY_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 typefully --path /webhooks/typefully
```

Use the Hookdeck URL as the webhook URL in Typefully.
