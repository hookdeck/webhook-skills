# Autotask Webhooks - FastAPI Example

Minimal example of receiving Autotask webhooks with `X-Hook-Signature` (HMAC-SHA1) verification.

## Prerequisites

- Python 3.9+
- An Autotask webhook created through the REST API, with a `SecretKey` and a `WebhookUrl` pointing at this server

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

3. Set `AUTOTASK_WEBHOOK_SECRET` in `.env` to the `SecretKey` you used when creating the webhook

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

To receive real callouts locally, run the Hookdeck CLI (no install or account needed) and use the URL it prints as your webhook's `WebhookUrl`:

```bash
npx hookdeck-cli listen 8000 autotask --path /webhooks/autotask
```
