# Schematic Webhooks - FastAPI Example

Minimal example of receiving Schematic webhooks with signature verification.

## Prerequisites

- Python 3.9+
- Schematic account with a webhook endpoint configured (gives you the webhook secret)

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

3. Add your Schematic webhook secret to `.env` as `SCHEMATIC_WEBHOOK_SECRET`

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
npx hookdeck-cli listen 8000 schematic --path /webhooks/schematic
```

Then set the Hookdeck URL as the endpoint URL in Schematic's webhooks page.

## Endpoint

- `POST /webhooks/schematic` - reads `await request.body()`, verifies `X-Schematic-Webhook-Signature` (hex HMAC-SHA256 of `rawBody + "+" + X-Schematic-Webhook-Timestamp`), then dispatches on the body's `action`
- Invalid or missing signature returns `401`
- `SCHEMATIC_WEBHOOK_TOLERANCE_SECONDS` (optional, off by default) rejects timestamps older than the window
