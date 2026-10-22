# Outreach Webhooks - FastAPI Example

Minimal example of receiving Outreach webhooks with signature verification (`Outreach-Webhook-Signature`, hex HMAC-SHA256 of the raw body).

## Prerequisites

- Python 3.9+
- An Outreach app with API access, and a webhook **created with a `secret`** (Outreach only signs when one is set)

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

3. Put the `secret` you set on the webhook in `.env` as `OUTREACH_WEBHOOK_SECRET`.

4. Create the webhook through the API, including `secret` (see `../../references/setup.md`).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

To receive real Outreach deliveries locally, use the Hookdeck CLI (no install or account needed):

```bash
npx hookdeck-cli listen 8000 outreach --path /webhooks/outreach
```

Use the URL it prints as the webhook's `url` when you create it.

## Endpoint

`POST /webhooks/outreach` returns `200` for a valid signature, `400` for a missing or invalid signature or invalid JSON, and `500` if `OUTREACH_WEBHOOK_SECRET` is not set.
