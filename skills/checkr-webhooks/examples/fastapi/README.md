# Checkr Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Checkr](https://checkr.com) webhooks and verifying the `X-Checkr-Signature` HMAC.

## Prerequisites

- Python 3.9+
- A Checkr account with Developer Settings access, or a Partner Application (see [setup](../../references/setup.md))

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

3. Set `CHECKR_SIGNING_KEY` in `.env` to your oldest secret API key, or to your Partner app's client secret.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/checkr` in [main.py](main.py).

## Test

```bash
pytest test_webhook.py -v
```

The tests cover Checkr's published test vector, the placeholder header for accounts without an API key, a valid signature, another event type, another key, a tampered body, pretty-printed JSON, a missing header, a trailing newline in the key, invalid JSON, and a missing key.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 checkr --path /webhooks/checkr
```

Add the printed URL as a webhook URL in Developer Settings (or on your Partner Application) and create a candidate with a test API key.

## Notes

- The handler reads `await request.body()` before parsing. The HMAC covers the exact raw body, so don't parse and re-serialise it first.
- Checkr doesn't guarantee order or single delivery. Dedupe on the event `id` and fetch the object when order matters.
