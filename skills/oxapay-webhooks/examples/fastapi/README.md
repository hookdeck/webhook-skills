# OxaPay Webhooks - FastAPI Example

Minimal example of receiving OxaPay callbacks with signature verification.

## Prerequisites

- Python 3.9+
- An OxaPay account: your merchant API key (payment callbacks) or payout API key (payout callbacks)

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

3. Add the API key to `.env` as `OXAPAY_WEBHOOK_SECRET`. Payment callbacks are signed with the merchant API key and payout callbacks with the payout API key, so run one deployment (or one Hookdeck source) per key.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000, endpoint `POST /webhooks/oxapay`.

## Receive callbacks locally

OxaPay does not call private networks such as localhost, so use a tunnel:

```bash
npx hookdeck-cli listen 8000 oxapay --path /webhooks/oxapay
```

Use the URL it prints as the `callback_url` of your OxaPay request. If you receive through a Hookdeck source, set the source's custom response to `ok`.

## Test

```bash
pytest test_webhook.py
```

The tests sign bodies with HMAC-SHA512 (hex) exactly as OxaPay does. The handler answers verified callbacks with `200` and the plain-text body `ok`, which OxaPay requires to treat a delivery as successful; a bad signature gets `401`.
