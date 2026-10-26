# High Mobility Webhooks - FastAPI Example

Minimal example of receiving High Mobility webhooks with `X-HM-Signature-256` verification.

## Prerequisites

- Python 3.9+
- High Mobility app with a webhook configured (URL, secret, events)

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

3. Add the webhook secret you entered in the High Mobility console to `.env` (`HIGH_MOBILITY_WEBHOOK_SECRET`)

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and the webhook route is `/webhooks/high-mobility`.

The route accepts GET, POST, PUT, PATCH and DELETE, because High Mobility's docs don't name the method (Hookdeck's High Mobility source pre-selects POST without managing the method). It reads the exact bytes with `await request.body()`, checks `sha256=` + hex HMAC-SHA256, and treats a missing body as zero bytes. Failures return 401; a verified request with no body returns 200.

## Test

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 high-mobility --path /webhooks/high-mobility
```

Use the Hookdeck URL as the webhook URL in the High Mobility console; saving the configuration sends a signed `ping`.
