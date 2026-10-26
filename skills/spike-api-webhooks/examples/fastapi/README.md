# Spike API Webhooks - FastAPI Example

Minimal example of receiving Spike API webhooks with signature verification.

Spike API has no published webhook verification SDK, so this example verifies the
`X-Body-Signature` header (bare hex HMAC-SHA256 of the raw body) manually with
`hmac` and compares as bytes with `hmac.compare_digest`.

## Prerequisites

- Python 3.9+
- A Spike API application with a webhook endpoint configured in the admin console, and its shared HMAC key

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

3. Add your shared HMAC key to `.env` as `SPIKE_API_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

## Local Testing with Hookdeck

```bash
npx hookdeck-cli listen 8000 spike-api --path /webhooks/spike-api
```

Use the printed URL as the webhook endpoint in the Spike API admin console. Spike API
sends a JSON array of events; the handler loops over every element.
