# PlanetScale Webhooks - FastAPI Example

Minimal example of receiving PlanetScale webhooks with signature verification.

## Prerequisites

- Python 3.9+
- A PlanetScale database with a webhook configured (Settings → Webhooks) and its secret

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

3. Add your PlanetScale webhook secret to `.env` as `PLANETSCALE_WEBHOOK_SECRET` (… → Show secret on the Webhooks page). Each webhook has its own secret.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 8000 planetscale --path /webhooks/planetscale
```

Then use the Hookdeck URL as the webhook URL in PlanetScale (database Settings → Webhooks → Add webhook). If you put Hookdeck in front, paste the webhook secret into the Hookdeck source.

### Trigger Test Events

On the Webhooks page, click **…** → **Test webhook** to send a `webhook.test` delivery (one test every 20 seconds).

## Endpoint

- `POST /webhooks/planetscale` - Receives and verifies PlanetScale webhook events (`X-PlanetScale-Signature`, hex HMAC-SHA256 of the raw body). Reads the body with `await request.body()` so the exact bytes are verified, and parses it only afterwards.
