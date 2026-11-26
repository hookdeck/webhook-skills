# Airwallex Webhooks - FastAPI Example

Minimal example of receiving Airwallex webhooks with signature verification.

## Prerequisites

- Python 3.9+
- Airwallex account with a webhook endpoint secret
  (Web app → Developer → Webhooks)

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

3. Add your Airwallex webhook secret to `.env` as `AIRWALLEX_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook endpoint is served at http://localhost:8000/webhooks/airwallex

## Test

```bash
pytest test_webhook.py -v
```

The tests generate real Airwallex signatures (HMAC-SHA256 over
`x-timestamp + raw_body`, hex-encoded) and assert the handler accepts valid
requests and rejects missing, invalid, tampered, and stale ones.

## Receive real webhooks locally

Use the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 airwallex --path /webhooks/airwallex
```

Register the printed HTTPS URL as a webhook under Developer → Webhooks in the
Airwallex web app, then re-trigger a past event from Settings → Developer → Events.

## How verification works

The Airwallex Node SDK has no webhook-verification helper, so verification is
done manually. The handler reads the **raw** body with `await request.body()`,
computes `HMAC-SHA256(secret, x-timestamp + raw_body)`, and compares it to the
`x-signature` header with `hmac.compare_digest` (constant-time) before parsing
and dispatching on the event `name` field. See
[../../references/verification.md](../../references/verification.md).

## Endpoint

- `POST /webhooks/airwallex` - Receives and verifies Airwallex webhook events
- `GET /health` - Health check
