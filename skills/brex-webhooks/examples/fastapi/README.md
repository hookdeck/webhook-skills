# Brex Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Brex](https://developer.brex.com/guides/webhooks) webhooks with signature verification (Standard Webhooks format, base64-decoded secret).

## Prerequisites

- Python 3.9+
- A Brex API token with access to the Webhooks API

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

3. Set `BREX_WEBHOOK_SECRET` to the `secret` with status `ACTIVE` from `GET https://api.brex.com/v1/webhooks/secrets` (see [setup](../../references/setup.md)). Paste it as returned, with or without a `whsec_` prefix.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/brex` in [main.py](main.py).

## Test

```bash
pytest test_webhook.py -v
```

The tests sign requests the way Brex does. They check Brex's documented sample vector (bare and `whsec_` secret), two signatures during key rotation, a secret used without decoding, tampered bodies, the optional timestamp window, resent messages (same `Webhook-Id`), and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 brex --path /webhooks/brex
```

Register the printed URL with `POST https://api.brex.com/v1/webhooks` (with an `Idempotency-Key` header) and the `event_types` you want. Brex allows one endpoint per API client: if you already have one, point it at this URL with `PUT /v1/webhooks/{id}`.

## Notes

- The handler reads `await request.body()` before parsing. The signature covers the exact raw body, so verifying a re-serialised `request.json()` breaks it.
- If `BREX_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- `BREX_WEBHOOK_TOLERANCE_SECONDS` turns on a timestamp window (Brex's guide uses 60 seconds). It's off by default because a delivery replayed later through a relay keeps its original timestamp; duplicates are caught by `Webhook-Id` instead.
- Payloads carry IDs only. Fetch details from the Brex API with an access token for `company_id`.
