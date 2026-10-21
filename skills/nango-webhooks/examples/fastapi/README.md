# Nango Webhooks - FastAPI Example

Minimal example of receiving Nango webhooks with `X-Nango-Hmac-Sha256` signature verification in FastAPI. Nango has no Python SDK for webhook verification, so this example computes the HMAC manually.

## Prerequisites

- Python 3.10+
- A Nango environment's webhook signing key (see [setup](../../references/setup.md))

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

3. Set `NANGO_WEBHOOK_SIGNING_KEY` in `.env` to the value from **Environment Settings > Webhooks > Signing key** (not the API key).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000.

## Test

### Run unit tests

```bash
pytest test_webhook.py -v
```

The tests sign payloads with Nango's algorithm (hex HMAC-SHA256 of the raw body) and cover valid, missing, tampered and wrong-key signatures, the legacy `X-Nango-Signature` header, and the `auth`, `sync`, `forward` and `async_action` webhook types.

### Receive real webhooks with the Hookdeck CLI

```bash
# No account required
npx hookdeck-cli listen 8000 nango --path /webhooks/nango
```

Add the printed URL under **Environment Settings > Webhook URLs** (or as a test connection's `webhook_url_override`), then create a connection or trigger a sync.

## Endpoint

- `POST /webhooks/nango` — verifies `X-Nango-Hmac-Sha256` against the raw body (400 on failure) and routes on the body's `type`.
- `GET /health` — liveness probe.
