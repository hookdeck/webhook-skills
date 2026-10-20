# Mux Webhooks - FastAPI Example

Minimal example of receiving Mux webhooks with signature verification in FastAPI.

The Mux Python SDK (`mux-python`) has no webhook verification helper, so this example verifies the `mux-signature` header manually: HMAC-SHA256 (hex) of `"<timestamp>.<raw body>"`, compared in constant time, with a 5-minute timestamp tolerance.

## Prerequisites

- Python 3.10+
- Mux account with a webhook signing secret (Dashboard → Settings → Webhooks)

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

3. Add your Mux webhook signing secret to `.env` as `MUX_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads with the real Mux algorithm and cover valid, invalid, tampered, expired, and future-dated requests.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 mux --path /webhooks/mux
```

Add the printed HTTPS URL as a webhook in the Mux Dashboard, use that webhook's signing secret as `MUX_WEBHOOK_SECRET`, then create an asset to trigger events.

## Endpoint

- `POST /webhooks/mux` - Receives and verifies Mux webhook events
- `GET /health` - Health check
