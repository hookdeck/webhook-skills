# Klarna Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Klarna](https://www.klarna.com) Notifications API webhooks and verifying the `Klarna-Signature` HMAC.

## Prerequisites

- Python 3.9+
- Klarna Notifications API credentials and a signing key (see [setup](../../references/setup.md))

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

3. Set `KLARNA_SIGNING_KEY` in `.env` to the `signing_key` that createSigningKey returned, as-is.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/klarna` in [main.py](main.py).

## Test

```bash
pytest test_webhook.py -v
```

The tests cover a valid signature, a base64 digest (rejected), a second event type, another key, a tampered body, a missing header, a trailing newline in the key, invalid JSON, and a missing key.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 klarna --path /webhooks/klarna
```

Create a Klarna webhook with the printed URL (port 443), then simulate an event in the test environment.

## Notes

- The handler reads `await request.body()` before parsing. The HMAC covers the exact raw body, so don't parse and re-serialise it first.
- One signing key is configured. During a key rotation, pick the key named by `Klarna-Signing-Key-Id` (see [verification](../../references/verification.md)).
