# Proof Webhooks - FastAPI Example

Minimal example of receiving Proof (proof.com, formerly Notarize) webhooks with signature verification.

## Prerequisites

- Python 3.10+
- A Proof account with a Webhooks V2 subscription (see [../../references/setup.md](../../references/setup.md))

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

3. Add the secret to `.env` as `PROOF_WEBHOOK_SECRET`. Paste the Proof API key that created the webhook, or its signing_key if you set one. Webhooks created with OAuth must set a signing_key.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

### Receive live webhooks locally

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 8000 proof --path /webhooks/proof
```

Use the tunnel URL as the `url` of a Proof webhook subscription, then trigger a transaction event.

## How It Works

- Reads the **raw** body with `await request.body()` before any parsing, whatever the content type.
- Reads the `X-Notarize-Signature` header: bare lowercase hex HMAC-SHA256 of the raw body, keyed with `PROOF_WEBHOOK_SECRET`.
- Checks the header is exactly 64 hex characters, then compares bytes with `hmac.compare_digest`.
- Returns `401` for a missing, malformed or mismatched signature; parses JSON only after it passes.
- Dispatches on the body's `event` field and returns `200` (anything else is retried).

## Endpoint

- `POST /webhooks/proof` - Receives and verifies Proof webhook events
- `GET /health` - Health check
