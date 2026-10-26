# Argyle Webhooks - FastAPI Example

Minimal example of receiving Argyle webhooks with signature verification (`X-Argyle-Signature`, HMAC-SHA512 hex of the raw body).

## Prerequisites

- Python 3.9+
- An Argyle webhook subscription **with a `secret`**

> Set a secret on the Argyle webhook subscription. Without one, deliveries are unsigned and fail verification.

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put the subscription's `secret` in `.env` as `ARGYLE_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000. The route accepts GET, POST, PUT, PATCH and DELETE at `/webhooks/argyle` (Argyle's docs don't name the method), reads the raw body with `await request.body()`, verifies the signature first for every method, and returns 200 for a verified empty body.

## Receive webhooks locally

```bash
npx hookdeck-cli listen 8000 argyle --path /webhooks/argyle
```

Use the URL it prints as the `url` of the subscription. Hookdeck's Argyle source pre-selects POST without managing the method, so allow any other method Argyle uses on the source too.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads with HMAC-SHA512 exactly as Argyle does. To send one by hand:

```bash
BODY='{"event":"accounts.connected","name":"my-subscription","data":{"account":"0187c66e-e7e5-811c-b006-2232f00f426a","user":"018051aa-f7a9-a0db-2f38-6cfa325e9d69"}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha512 -hmac "$ARGYLE_WEBHOOK_SECRET" -hex | sed 's/^.* //')
curl -X POST http://localhost:8000/webhooks/argyle \
  -H "Content-Type: application/json" \
  -H "X-Argyle-Signature: $SIG" \
  -d "$BODY"
```
