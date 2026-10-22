# Middesk Webhooks - FastAPI Example

Minimal example of receiving Middesk webhooks with `X-Middesk-Signature-256` signature verification.

## Prerequisites

- Python 3.9+
- A Middesk account and the secret you set when creating the webhook

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

3. Add your webhook secret to `.env` as `MIDDESK_WEBHOOK_SECRET`. Use it exactly as you set it (for example `whsec_abcdef123456`); the whole string is the HMAC key.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the test suite (generates real HMAC-SHA256 signatures):

```bash
pytest test_webhook.py -v
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 8000 middesk --path /webhooks/middesk
```

Create a Middesk webhook (Settings > Webhooks, or `POST /v1/webhooks`) pointing at the Hookdeck URL, with the same `secret` you put in `.env`.

## Endpoint

- `POST /webhooks/middesk` - Receives and verifies Middesk webhooks
