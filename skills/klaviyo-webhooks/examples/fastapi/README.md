# Klaviyo Webhooks - FastAPI Example

Minimal example of receiving Klaviyo system webhooks with HMAC-SHA256 signature
verification using FastAPI.

## Prerequisites

- Python 3.9+
- A Klaviyo webhook with an endpoint secret (min 16 chars)

## Setup

1. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Add your Klaviyo endpoint secret to `.env` as `KLAVIYO_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the unit tests (they generate real signatures):

```bash
pytest test_webhook.py
```

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel Klaviyo deliveries to your local server (no account
required):

```bash
npx hookdeck-cli listen 8000 klaviyo --path /webhooks/klaviyo
```

Then trigger a subscribed event in Klaviyo (e.g. open a test email).

## How It Works

- The handler reads the raw body with `await request.body()` — Klaviyo signs
  `raw_body + Klaviyo-Timestamp` with HMAC-SHA256 (hex).
- The `Klaviyo-Signature` header is compared with `hmac.compare_digest`.
- After verification, the handler iterates over the batched `data` array and
  dispatches each event by its `topic`.

## Endpoint

- `POST /webhooks/klaviyo` - Receives and verifies Klaviyo webhook events
- `GET /health` - Health check
