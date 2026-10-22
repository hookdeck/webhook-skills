# Trigger.dev Webhooks - FastAPI Example

Minimal example of receiving Trigger.dev alert webhooks with signature verification.

## Prerequisites

- Python 3.9+
- A Trigger.dev project with a webhook alert channel (gives you the alert webhook secret)

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

3. Add your alert webhook secret to `.env` (`TRIGGER_DEV_WEBHOOK_SECRET`). It is shown on the Alerts page when you create the webhook alert.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and receives webhooks at `POST /webhooks/trigger-dev`.

## Receive webhooks locally

```bash
npx hookdeck-cli listen 8000 trigger-dev --path /webhooks/trigger-dev
```

Use the URL the CLI prints as the webhook URL of your Trigger.dev alert channel.

## Test

```bash
pytest test_webhook.py
```

Tests generate real signatures (`x-trigger-signature-hmacsha256`, hex HMAC-SHA256 of the raw body) for `alert.run.failed`, `alert.deployment.success`, `alert.deployment.failed` and `alert.error`.
