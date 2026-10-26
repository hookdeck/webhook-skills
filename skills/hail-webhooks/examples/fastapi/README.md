# Hail Webhooks - FastAPI Example

Minimal example of receiving Hail webhooks with `X-Hail-Signature` verification.

## Prerequisites

- Python 3.9+
- Hail account with API access, and a webhook subscription created through the API (`POST /webhooks`) so you have its signing secret

## Setup

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the signing secret to `.env` (`HAIL_WEBHOOK_SECRET`). Hail returns it only when the subscription is created. Use the whole string, including `whsec_`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

The handler reads the raw body with `await request.body()` in a dependency, verifies `X-Hail-Signature` (`t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`, the whole `whsec_` secret as the key), then dispatches on the body's `type`. The timestamp check is off by default because Hookdeck retries and replays keep the original timestamp (Hail re-signs its own retries); set `HAIL_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 hail --path /webhooks/hail
```

Use the Hookdeck URL as the `target_url` when you create the subscription with `POST https://api.hail.so/v1/webhooks`.
