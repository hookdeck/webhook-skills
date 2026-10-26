# Payt Webhooks - FastAPI Example

Minimal example of receiving Payt webhooks and verifying the `X-PAYT-SIGNATURE` signature (hex HMAC-SHA256
of the raw body).

## Prerequisites

- Python 3.9+
- A Payt administration with webhooks activated and its webhook secret (shown only once, on the webhooks settings page)

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `PAYT_WEBHOOK_SECRET` to the secret from the webhooks settings page.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/payt`.

## Test

```bash
pytest test_webhook.py
```

The tests sign real payloads (hex HMAC-SHA256 of the raw body) shaped like the documented events and check valid,
missing, malformed, wrong-secret, tampered, re-serialised, prefixed and base64 signatures.

## Receive Payt Webhooks Locally

```bash
npx hookdeck-cli listen 8000 payt --path /webhooks/payt
```

Use the printed URL as the webhook URL in Payt (see [../../references/setup.md](../../references/setup.md)).

## How It Works

- `main.py`: `verify_payt_signature()` and the `POST /webhooks/payt` route

1. `await request.body()` reads the exact bytes; JSON is parsed only after verification.
2. The header must be exactly 64 hex characters; it is lowercased and compared with `hmac.compare_digest` on bytes to the hex HMAC-SHA256 of the raw body. A missing, malformed or wrong signature returns `401`; a missing secret returns `500`.
3. Invalid JSON or a missing `event.event_name` returns `400`.
4. The handler dispatches on `event.event_name` and logs unhandled events.
5. It returns `200 {"received": true}` (Payt needs a 200 within 10 seconds). Delivery is at least once and unordered: make processing idempotent.
