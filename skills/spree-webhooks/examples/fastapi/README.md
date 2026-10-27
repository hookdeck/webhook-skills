# Spree Webhooks - FastAPI Example

Minimal example of receiving Spree Commerce webhooks with signature verification. Spree's SDK helper takes the body as a string, so the HMAC check is manual on the raw bytes.

## Prerequisites

- Python 3.9+
- Spree store with a webhook endpoint (its `secret_key` is shown only once, when you create the endpoint)

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

3. Add your endpoint's `secret_key` to `.env` as `SPREE_WEBHOOK_SECRET` (used as-is, not hex-decoded)

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

### Run the tests

```bash
pytest test_webhook.py -v
```

The tests sign payloads with the real Spree algorithm (hex HMAC-SHA256 of `"<X-Spree-Webhook-Timestamp>.<raw body>"`) and cover valid, invalid, tampered, replayed and opt-in-tolerance requests.

### Send a test event from Spree

Create an endpoint pointing at your tunnel URL, then call `send_test` on it (`POST /api/v3/admin/webhook_endpoints/{id}/send_test`) to deliver a `webhook.test` event. A valid delivery returns `200`; a wrong secret or signature returns `401`.

### Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 spree --path /webhooks/spree
```

Use the printed public HTTPS URL as the endpoint `url` in Spree. Optional: set `SPREE_WEBHOOK_TOLERANCE_SECONDS` to reject old timestamps (off by default, because Hookdeck retries and replays resend the original timestamp).
