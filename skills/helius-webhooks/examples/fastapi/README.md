# Helius Webhooks - FastAPI Example

Minimal example of receiving Helius webhooks and checking the `Authorization` header (Helius does not sign payloads).

## Prerequisites

- Python 3.9+
- Helius account with a webhook whose `authHeader` you chose

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

3. Set `HELIUS_AUTH_HEADER` in `.env` to the exact `authHeader` value you registered on the Helius webhook (for example `Bearer your-secret-token`).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 8000 helius --path /webhooks/helius
```

Use the Hookdeck URL as the webhook URL in Helius, and set the authentication header there.

## Test

```bash
pytest test_webhook.py -v
```

Or send a request by hand:

```bash
curl -X POST http://localhost:8000/webhooks/helius \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-token" \
  -d '[{"type":"TRANSFER","signature":"abc123","description":"test transfer"}]'
```

## Endpoint

- `POST /webhooks/helius`: `200` accepted, `401` bad or missing `Authorization`, `400` invalid JSON, `500` secret not configured
- `GET /health`
