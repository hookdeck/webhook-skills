# Sublime Security Webhooks - FastAPI Example

Minimal example of receiving Sublime Security webhook Action deliveries with signature verification.

## Prerequisites

- Python 3.9+
- Sublime Security account with a webhook Action and its signing secret

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

3. Add your webhook Action's signing secret to `.env` (`SUBLIME_SECURITY_WEBHOOK_SECRET`). In Sublime, open **Actions**, select the webhook Action, and click to reveal the secret.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

A dependency reads the raw body and verifies `X-Sublime-Signature` (`t=<unix seconds>,v0=<hex>`): lowercase hex HMAC-SHA256 of `<t>.<raw body>`, accepting any `v0` value that matches. A missing or invalid signature gets a 401. The timestamp check is off by default because Hookdeck retries and replays keep the original timestamp; set `SUBLIME_SECURITY_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
pytest test_webhook.py
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 sublime-security --path /webhooks/sublime-security
```

Use the Hookdeck URL as the webhook Action's URL in Sublime (Actions → webhook Action), then attach the Action to a rule or trigger it manually on a message.
