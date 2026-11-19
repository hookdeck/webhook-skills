# BitGo Webhooks - FastAPI Example

Minimal FastAPI example of receiving [BitGo](https://www.bitgo.com) webhooks and verifying the `X-Signature-SHA256` HMAC.

## Prerequisites

- Python 3.9+
- A BitGo account (the test environment is free) and a webhook secret from `POST /api/v2/webhook/secret` (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `BITGO_WEBHOOK_SECRET` in `.env` to the secret returned by `POST /api/v2/webhook/secret`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/bitgo` in [main.py](main.py).

## Test

```bash
pytest test_webhook.py -v
```

The tests cover a valid signature, a base64 digest (rejected), a second webhook type, another secret, a tampered body, a missing header, a trailing newline in the secret, invalid JSON, and a missing secret.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 bitgo --path /webhooks/bitgo
```

Add a wallet webhook with the printed URL, then call its `simulate` endpoint with `{"usePlaceholderData": true}`. Cross-check the first delivery with `POST /api/v2/webhook/{webhookId}/verify`.

## Notes

- The handler reads `await request.body()` before parsing. The HMAC covers the exact raw body, so don't parse and re-serialise it first.
- The hex HMAC-SHA256 check is inferred. Confirm it once against BitGo's `POST /api/v2/webhook/{webhookId}/verify` endpoint.
