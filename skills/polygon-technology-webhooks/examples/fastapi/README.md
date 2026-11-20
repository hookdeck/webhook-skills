# Polygon Technology Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Polygon Technology](https://docs.polygon.technology/payments/) OMS payments webhooks: verifying `Webhook-Signature` in a dependency, deduplicating on `id` and `idempotencyKey`, and ordering by `createdAt`.

## Prerequisites

- Python 3.9+
- An OMS API key and a webhook subscription's `signingKey` (see [setup](../../references/setup.md))

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

3. Set `OMS_WEBHOOK_SIGNING_KEY` in `.env` to the cleartext `signingKey` that `POST /webhooks` returned, as-is.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/polygon-technology` in [main.py](main.py).

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads the way OMS does (`t=<t>,v1=<hex HMAC-SHA256 of "<t>.<body>">`) and cover header parsing, encodings, the 300 second window in both directions, bad signatures, dedupe on `id` and `idempotencyKey`, ordering, unknown types, pre-v1 events, invalid JSON and a missing key.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 polygon-technology --path /webhooks/polygon-technology
```

Register the printed HTTPS URL with `POST /webhooks`, then send a signed test delivery with `POST /webhooks/{webhookId}/test`.

## Notes

- The `verified_body` dependency reads `await request.body()` and verifies before anything parses JSON. Don't declare a Pydantic body model on this route: FastAPI would parse the body first.
- Bad signatures get `401`, as in the OMS docs. OMS retries any non-2xx.
- The dedupe and ordering stores are in memory. Use a database with unique constraints in production, and return 2xx before slow work: each attempt times out after `timeoutMs` (default 5000 ms).
