# Zernio Webhooks - FastAPI Example

Minimal example of receiving Zernio webhooks with signature verification (HMAC-SHA256 of the raw body, `X-Zernio-Signature`).

## Prerequisites

- Python 3.9+
- A Zernio account with a webhook endpoint whose secret you chose yourself (Zernio never generates one)

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

3. Set `ZERNIO_WEBHOOK_SECRET` in `.env` to the secret you sent in `POST /v1/webhooks/settings`

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000

## Test

Run the automated tests:

```bash
pytest test_webhook.py -v
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 8000 zernio --path /webhooks/zernio
```

Use the Hookdeck URL as the endpoint `url` in Zernio, then call `POST /v1/webhooks/test` to send a `webhook.test` event.

## Endpoint

- `POST /webhooks/zernio` - Receives and verifies Zernio webhook events
- `GET /health` - Health check
