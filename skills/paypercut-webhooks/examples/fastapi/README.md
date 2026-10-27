# Paypercut Webhooks - FastAPI Example

Minimal example of receiving Paypercut webhooks and verifying the `Paypercut-Signature` header (hex HMAC-SHA256 over `{t}.{raw body}`).

## Prerequisites

- Python 3.9+
- A Paypercut webhook endpoint and its signing secret (see [references/setup.md](../../references/setup.md))

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

3. Put your endpoint's signing secret into `.env` as `PAYPERCUT_WEBHOOK_SECRET`. Optionally set `PAYPERCUT_WEBHOOK_TOLERANCE_SECONDS` (off by default; see [references/verification.md](../../references/verification.md)).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts GET, POST, PUT, PATCH and DELETE on `/webhooks/paypercut`.

## Test

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally, tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 paypercut --path /webhooks/paypercut
```
