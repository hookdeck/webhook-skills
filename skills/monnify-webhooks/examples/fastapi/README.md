# Monnify Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Monnify](https://monnify.com) webhooks and verifying the `monnify-signature` HMAC-SHA512.

## Prerequisites

- Python 3.9+
- A Monnify merchant account (signed webhooks need the live environment) and its client secret key (see [setup](../../references/setup.md))

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

3. Set `MONNIFY_CLIENT_SECRET` in `.env` to your client secret key from the Monnify dashboard.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/monnify` in [main.py](main.py).

## Test

```bash
pytest test_webhook.py -v
```

The tests cover a valid HMAC-SHA512 signature, a base64 digest (rejected), plain SHA-512 of secret + body (rejected), a second event type, another secret, a tampered body, a missing header, a trailing newline in the secret, invalid JSON, and a missing secret.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 monnify --path /webhooks/monnify
```

Set the printed URL as a webhook URL in the Monnify dashboard. Sandbox deliveries carry no `monnify-signature`, so the example answers them with `401`.

## Notes

- The handler reads `await request.body()` before parsing. The HMAC covers the exact raw body, so don't parse and re-serialise it first.
- Monnify's sandbox sends no `monnify-signature`, so sandbox deliveries get `401`. That's expected.
