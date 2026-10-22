# VGS Webhooks - FastAPI Example

Minimal example of receiving VGS (Very Good Security) webhooks with `vgs-signature` verification.

## Prerequisites

- Python 3.9+
- VGS organization with Notifications enabled and the webhook integration's secret

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

3. Add your VGS integration secret to `.env` (`VGS_WEBHOOK_SECRET`)

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

The handler verifies `vgs-signature` (`t=<unix seconds>,v0=<hex>`, HMAC-SHA256 of `<t>.<raw body>`). The timestamp check is off by default because VGS and Hookdeck retries keep the original timestamp; set `VGS_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 vgs --path /webhooks/vgs
```

Use the Hookdeck URL as the destination in VGS Dashboard → Organization Settings → Notifications.
