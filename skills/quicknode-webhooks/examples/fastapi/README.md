# Quicknode Webhooks - FastAPI Example

Minimal example of receiving Quicknode Streams and Webhooks deliveries with signature verification (`X-QN-Signature`, hex HMAC-SHA256 of `X-QN-Nonce` + `X-QN-Timestamp` + raw body).

## Prerequisites

- Python 3.9+
- A Quicknode Stream (webhook destination) or Webhook, and its security token

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

3. Set `QUICKNODE_WEBHOOK_SECRET` in `.env` to the security token from the Quicknode dashboard

4. Keep payload compression (gzip) off on the stream or webhook: Quicknode signs the uncompressed body.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the automated tests:

```bash
pytest test_webhook.py -v
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 8000 quicknode --path /webhooks/quicknode
```

Use the Hookdeck URL as the destination URL of your stream or webhook.

## Endpoint

- `POST /webhooks/quicknode` - Receives and verifies Quicknode deliveries (no event types; the handler dispatches on payload shape and the payloads shown are illustrative). The route reads `await request.body()` so the exact bytes are verified.
- `GET /health` - Health check

## Optional timestamp tolerance

By default old timestamps are not rejected, because Hookdeck retries and replays resend the original headers. Set `QUICKNODE_WEBHOOK_TOLERANCE_SECONDS` to opt in.
