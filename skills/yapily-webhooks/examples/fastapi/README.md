# Yapily Webhooks - FastAPI Example

Minimal example of receiving Yapily webhooks with signature verification.

## Prerequisites

- Python 3.9+
- Yapily application with the Webhooks product enabled (Private Beta) and the webhook secret from registration

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

3. Add the `webhookSecret` returned by `POST /webhook/events` to `.env` as `YAPILY_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 8000 yapily --path /webhooks/yapily
```

Then register the Hookdeck URL as the `callbackUrl.main.url` of your Yapily webhook (no query parameters allowed).

## Endpoint

- `POST /webhooks/yapily` - Receives and verifies Yapily webhook events. Verifies `webhook-signature` (or `webhook-rotation-signature` during a secret rotation) against the raw request body.
