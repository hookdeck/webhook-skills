# Autosana Webhooks - FastAPI Example

Minimal example of receiving Autosana webhooks with signature verification (`X-Autosana-Signature-256`, HMAC-SHA256 of the raw body).

## Prerequisites

- Python 3.10+
- Autosana account with a webhook that has a signing secret

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

3. Add the signing secret of your Autosana webhook (Settings > Integrations > Webhooks) to `.env` as `AUTOSANA_WEBHOOK_SECRET`. Without a signing secret Autosana sends unsigned payloads, and this handler rejects them.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000, endpoint `POST /webhooks/autosana`.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 8000 autosana --path /webhooks/autosana
```

Use the Hookdeck URL as the endpoint URL of your Autosana webhook, then use the Test button or complete a batch of flow runs.

## Test

```bash
pytest test_webhook.py
```
