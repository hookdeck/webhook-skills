# Tremendous Webhooks - FastAPI Example

Minimal example of receiving Tremendous webhooks with signature verification.

## Prerequisites

- Python 3.10+
- Tremendous account with a webhook created via the API (it returns the `private_key`)

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

3. Add your Tremendous webhook `private_key` to `.env` as `TREMENDOUS_WEBHOOK_PRIVATE_KEY`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

### Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 tremendous --path /webhooks/tremendous
```

Then register the Hookdeck URL as the webhook `url` (`POST /webhooks`) and fire a sample event with `POST /webhooks/{id}/simulate` (for example `{"event": "INVOICES.PAID"}`).

## Endpoint

- `POST /webhooks/tremendous` - Receives and verifies Tremendous webhook events (`Tremendous-Webhook-Signature`). Reads the raw bytes with `await request.body()`.
