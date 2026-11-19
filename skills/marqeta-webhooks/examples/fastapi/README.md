# Marqeta Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Marqeta](https://www.marqeta.com) webhooks and verifying the required Basic auth credentials (and the optional `X-Marqeta-Signature` HMAC).

## Prerequisites

- Python 3.9+
- Marqeta API access (the public sandbox works) and a webhook created with Basic auth credentials (see [setup](../../references/setup.md))

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

3. Set `MARQETA_WEBHOOK_USERNAME` and `MARQETA_WEBHOOK_PASSWORD` in `.env` to the webhook's Basic auth credentials. Set `MARQETA_WEBHOOK_SECRET` (and `MARQETA_SIGNATURE_ALGORITHM`) only if the webhook has a secret.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/marqeta` in [main.py](main.py).

## Test

```bash
pytest test_webhook.py -v
```

The tests cover Basic auth (a colon in the password, scheme case, other schemes, malformed values), HMAC-SHA256 and HMAC-SHA1 signatures, base64, another secret and changed bodies (rejected), batched transactions, card transitions, the ping, wrong and missing credentials, signature checks when a secret is set, an algorithm switch, invalid JSON, and missing credentials.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 marqeta --path /webhooks/marqeta
```

Use the printed URL as the webhook's `config.url`, then call `POST /webhooks/{token}/ping`.

## Notes

- The handler reads `await request.body()` before parsing, so the optional HMAC covers the exact raw body.
- Basic auth is always checked; the signature is checked only when `MARQETA_WEBHOOK_SECRET` is set.
