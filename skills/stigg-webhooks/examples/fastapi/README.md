# Stigg Webhooks - FastAPI Example

Minimal example of receiving Stigg webhooks with secret verification and event handling.

> **Stigg does not sign webhook payloads yet** (HMAC is on its roadmap). Each event
> carries the webhook secret in the `Stigg-Webhooks-Secret` header. This example
> compares it with `STIGG_WEBHOOK_SECRET` in constant time.

## Prerequisites

- Python 3.9+
- Stigg account with access to Settings > Integrations > Webhooks

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

3. Add the webhook secret from your Stigg webhook details page to `.env`. If it is not set, the endpoint returns `500` (fails closed).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

### Receive webhooks locally

```bash
npx hookdeck-cli listen 8000 stigg --path /webhooks/stigg
```

Use the Hookdeck URL as your Stigg webhook endpoint URL, then use **Send test event** in Stigg.

## Endpoint

- `POST /webhooks/stigg` - Checks `Stigg-Webhooks-Secret`, dispatches on `type`
