# Smartsheet Webhooks - FastAPI Example

Minimal example of receiving Smartsheet webhooks with signature verification and the verification-challenge handshake in FastAPI.

Smartsheet has no webhook verification SDK helper, so this example verifies the `Smartsheet-Hmac-SHA256` header manually: hex HMAC-SHA256 of the raw body keyed with the webhook's `sharedSecret`, compared case-insensitively in constant time.

## Prerequisites

- Python 3.10+
- Smartsheet account with API access (to create a webhook and read its `sharedSecret`)

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

3. Add the webhook's `sharedSecret` to `.env` as `SMARTSHEET_SHARED_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads with the real Smartsheet algorithm and cover the challenge handshake (signed and unsigned), valid, invalid, tampered, and upper-case signatures, and event dispatch.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 smartsheet --path /webhooks/smartsheet
```

Use the printed HTTPS URL as the webhook's `callbackUrl` (`POST /webhooks`), then enable it (`PUT /webhooks/{id}` with `{"enabled": true}`). Smartsheet sends the challenge request, then callbacks as events occur.

## Endpoint

- `POST /webhooks/smartsheet` - Answers `Smartsheet-Hook-Challenge` requests and receives verified callbacks
- `GET /health` - Health check
