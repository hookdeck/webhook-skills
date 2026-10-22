# HeyGen Webhooks - FastAPI Example

Minimal example of receiving HeyGen webhooks with signature verification. HeyGen has no webhook verification SDK, so the HMAC-SHA256 check is done manually with `hmac`.

## Prerequisites

- Python 3.9+
- HeyGen account with a webhook endpoint secret (`whsec_...`)

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

3. Add your endpoint secret (returned once by `POST /v3/webhooks/endpoints`) to `.env` as `HEYGEN_WEBHOOK_SECRET`, keeping the `whsec_` prefix. It is used whole as a UTF-8 HMAC key; this is not Standard Webhooks.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000

## Test

### Run the tests

```bash
pytest test_webhook.py -v
```

The tests sign payloads with HeyGen's real algorithm (hex HMAC-SHA256 of the raw body, `signature` header) and cover valid, invalid, tampered, and wrong-key requests.

### Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 heygen --path /webhooks/heygen
```

Register the public URL the CLI prints as the `url` of a HeyGen webhook endpoint (see `references/setup.md`), then render a video to trigger `avatar_video.success`.

## Endpoint

- `POST /webhooks/heygen` - Receives and verifies HeyGen webhook events
- `GET /health` - Health check
