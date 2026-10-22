# Acuity Scheduling Webhooks - FastAPI Example

Minimal example of receiving Acuity Scheduling webhooks with signature verification.

## Prerequisites

- Python 3.10+
- Acuity Scheduling account and API key (see [../../references/setup.md](../../references/setup.md))

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

3. Add your Acuity API key to `.env` as `ACUITY_API_KEY`. Acuity signs webhooks with the API key
   (the main admin's key for static webhooks), not a separate webhook secret.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

### Receive live webhooks locally

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 8000 acuity-scheduling --path /webhooks/acuity-scheduling
```

Point the Acuity Webhook integration (or a dynamic webhook `target`) at the tunnel URL, then book,
reschedule or cancel an appointment.

## How It Works

- Reads the **raw** body with `await request.body()` before any parsing.
- Reads the `X-Acuity-Signature` header.
- Computes base64 HMAC-SHA256 of the raw body keyed with `ACUITY_API_KEY`, compared with `hmac.compare_digest`.
- Only after verification, parses the form-encoded body with `urllib.parse.parse_qs`.

## Endpoint

- `POST /webhooks/acuity-scheduling` - Receives and verifies Acuity Scheduling webhook events
- `GET /health` - Health check
