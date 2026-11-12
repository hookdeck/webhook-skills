# Coinbase (CDP) Webhooks - FastAPI Example

Minimal example of receiving Coinbase Developer Platform (CDP) webhooks with
signature verification. CDP has no Python webhook-verification helper, so the
handler verifies `X-Webhook-Signature` manually (HMAC-SHA256, hex).

## Prerequisites

- Python 3.9+
- A CDP webhook subscription and the `secret` from its create response
  (see [../../references/setup.md](../../references/setup.md))

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

3. Set `COINBASE_WEBHOOK_SECRET` in `.env` to the subscription secret.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

The tests sign payloads with real HMAC-SHA256 `v0`/`v1` signatures:

```bash
pytest test_webhook.py
```

### Receive real webhooks locally

CDP only delivers to HTTPS URLs. Forward deliveries to your local server with the
Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 coinbase --path /webhooks/coinbase
```

Use the HTTPS URL it prints as `target.url` when you create the subscription.

## How It Works

- `await request.body()` reads the **raw body** inside a dependency. The signature
  covers the exact bytes, so never verify against re-serialized JSON.
- Reads `X-Webhook-Signature`, falling back to the deprecated `X-Hook0-Signature`.
- Parses `t`, `v0`, `h`, `v1` by key (order isn't guaranteed). Verifies `v1` over
  `{t}.{h}.{headerValues}.{body}` when `v1` and `h` are present, otherwise `v0`
  over `{t}.{body}`.
- Rejects timestamps more than 5 minutes off, malformed hex (400, not a crash) and
  mismatches. An unset secret returns 500.
- Routes on the `X-Event-Type` header and de-duplicates on `X-Event-Id`.

## Endpoint

- `POST /webhooks/coinbase` - Receives and verifies CDP webhooks
- `GET /health` - Health check
