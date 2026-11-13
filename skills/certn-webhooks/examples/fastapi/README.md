# Certn Webhooks - FastAPI Example

Minimal example of receiving CertnCentric webhooks: the `GET` challenge echo and `X-Signature` verification.

## Prerequisites

- Python 3.9+
- A CertnCentric account with access to the Integrations area of the Client Portal

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the signing key Certn shows when you create the webhook to `.env` (`CERTN_WEBHOOK_SECRET`).

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000

`GET /webhooks/certn?challenge=...` returns the challenge as a plain-text body, which is how Certn checks the URL when you add it and again periodically. `POST /webhooks/certn` reads the raw body with `await request.body()`, checks `X-Signature` (hex HMAC-SHA256 of the raw body), then dispatches on `event_type`: `CASE_STATUS_CHANGED`, `CHECK_STATUS_CHANGED`, `CASE_REPORT_READY` and `CASE_INPUT_CLAIMS_AUTOMATICALLY_GENERATED`.

## Test

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 certn --path /webhooks/certn
```

Add the Hookdeck URL as a webhook URL in the Integrations area of the Certn Client Portal.
