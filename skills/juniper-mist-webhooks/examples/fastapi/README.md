# Juniper Mist Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Juniper Mist](https://www.mist.com) webhooks and verifying the `X-Mist-Signature-v2` HMAC.

## Prerequisites

- Python 3.9+
- A Mist organization and an HTTP Post webhook with a Secret (see [setup](../../references/setup.md))

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

3. Set `MIST_WEBHOOK_SECRET` in `.env` to the Secret on the Mist webhook.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/juniper-mist` in [main.py](main.py).

## Test

```bash
pytest test_webhook.py -v
```

The tests cover a valid v2 signature, a base64 digest (rejected), uppercase hex, the v1 SHA-1 value in place of v2 (rejected), a batch of two events, another secret, a tampered body, a missing header, a request with only the v1 header (rejected), v2 alongside v1, a trailing newline in the secret, invalid JSON, and a missing secret.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 juniper-mist --path /webhooks/juniper-mist
```

Add an HTTP Post webhook with the printed URL and a Secret, then send a test with `POST /api/v1/orgs/{org_id}/webhooks/{webhook_id}/ping`.

## Notes

- The handler reads `await request.body()` before parsing. The HMAC covers the exact raw body, so don't parse and re-serialise it first.
- Only `X-Mist-Signature-v2` is checked. The legacy SHA-1 `X-Mist-Signature` is ignored.
