# OpnForm Webhooks - FastAPI Example

Minimal example of receiving OpnForm form submission webhooks with signature verification.

## Prerequisites

- Python 3.9+
- An OpnForm form with a webhook integration and a webhook secret

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

3. Set a webhook secret on the OpnForm webhook integration (12+ characters). Without one, deliveries are unsigned and fail verification. Put the same value in `.env` as `OPNFORM_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

The handler reads the raw bytes with `await request.body()` in a dependency and verifies `X-Webhook-Signature` (`sha256=<hex>`): lowercase hex HMAC-SHA256 of the raw body, keyed with the secret. The prefix is optional. A missing or invalid signature gets a 401. Only after that is the body parsed.

## Test

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 opnform --path /webhooks/opnform
```

Use the Hookdeck URL as the webhook integration's URL in OpnForm, then submit the form.
