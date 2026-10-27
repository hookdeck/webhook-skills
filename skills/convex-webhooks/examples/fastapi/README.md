# Convex Webhooks - FastAPI Example

Minimal example of receiving Convex webhook log stream events with signature verification (`x-webhook-signature`, `sha256=<hex>` HMAC-SHA256 of the raw body).

## Prerequisites

- Python 3.9+
- Convex deployment on a Pro plan (log streams require Pro) with a webhook log stream

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the HMAC secret shown in the Convex dashboard when you configure the webhook log stream to `.env` as `CONVEX_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000, endpoint `POST /webhooks/convex`.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 8000 convex --path /webhooks/convex
```

Use the Hookdeck URL as the webhook URL of your Convex log stream (Deployment Settings > Integrations). Convex sends a `verification` event when the stream is created.

## Test

```bash
pytest test_webhook.py
```

Tests generate real `sha256=<hex>` signatures over a batch of log events (`verification`, `console`, `function_execution`, `audit_log`, `scheduler_stats`, `current_storage_usage`).
