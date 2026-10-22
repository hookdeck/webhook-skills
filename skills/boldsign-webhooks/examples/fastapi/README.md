# BoldSign Webhooks - FastAPI Example

Minimal example of receiving BoldSign webhooks with signature verification.

## Prerequisites

- Python 3.9+
- BoldSign account with a webhook and its signing secret

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

3. Add your BoldSign webhook signing secret to `.env` (`BOLDSIGN_WEBHOOK_SECRET`). Reveal it on the webhook's overview page.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

The handler reads the raw body with `await request.body()` and verifies `X-BoldSign-Signature` (`t=<unix seconds>, s0=<hex>`, plus `s1` during a secret rollover): HMAC-SHA256 of `<t>.<raw body>`. The setup `Verification` POST gets a 200 straight away. The timestamp check is off by default because retries and replays keep the original timestamp; set `BOLDSIGN_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 boldsign --path /webhooks/boldsign
```

Use the Hookdeck URL as the webhook URL in BoldSign → API → Webhooks → Add Webhook, then click **Verify** (BoldSign sends a `Verification` event and expects a 200 within 10 seconds).
