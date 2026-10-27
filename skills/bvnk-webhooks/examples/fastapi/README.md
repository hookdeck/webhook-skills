# BVNK Webhooks - FastAPI Example

Minimal example of receiving BVNK webhooks with signature verification.

## Prerequisites

- Python 3.9+
- BVNK account with a webhook configured in the BVNK Portal

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Paste the secret shown in the webhook's Public Key field in BVNK. Legacy BVNK webhooks (statusChanged events) sign differently and fail verification. Put it in `.env` as `BVNK_WEBHOOK_SECRET`, exactly as shown.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

The handler reads the raw body in a dependency with `await request.body()` and verifies `x-signature`: the standard base64 (44-character) HMAC-SHA256 of the raw body, keyed with the secret's UTF-8 bytes (not base64-decoded). A missing, malformed or wrong signature gets a 401. No timestamp is signed, so there is no replay window; deduplicate on `eventId`.

Legacy BVNK webhooks (`statusChanged` events) sign differently and fail verification.

## Test

```bash
pytest test_webhook.py
```

The tests include BVNK's published test vector from its documentation.

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 bvnk --path /webhooks/bvnk
```

Use the Hookdeck URL as the webhook URL in the BVNK Portal (Integrations → Webhooks).
