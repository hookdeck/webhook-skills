# Calendly Webhooks - FastAPI Example

Minimal example of receiving Calendly webhooks with signature verification in FastAPI.

## Prerequisites

- Python 3.10+
- A Calendly webhook subscription with a signing key (see [../../references/setup.md](../../references/setup.md))

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

3. Add your Calendly webhook signing key to `.env` as `CALENDLY_WEBHOOK_SIGNING_KEY`.

## Run

```bash
uvicorn main:app --port 8000
```

The webhook endpoint is available at http://localhost:8000/webhooks/calendly

## Test

Run the test suite (generates real signatures and verifies the endpoint):

```bash
pytest test_webhook.py -v
```

### Receive live webhooks locally

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 8000 calendly --path /webhooks/calendly
```

Point your Calendly webhook subscription's `url` at the tunnel URL, then schedule,
cancel, or mark a no-show on an event.

## How It Works

- Reads the **raw** body with `await request.body()` — no JSON parsing before verifying.
- Reads the `Calendly-Webhook-Signature` header (`t=<ts>,v1=<sig>`).
- Computes HMAC-SHA256 (hex) over `{timestamp}.{raw body}` and compares with
  `hmac.compare_digest` (timing-safe).
- Rejects timestamps older than 180 seconds to prevent replay attacks.

## Endpoint

- `POST /webhooks/calendly` - Receives and verifies Calendly webhook events
- `GET /health` - Health check
