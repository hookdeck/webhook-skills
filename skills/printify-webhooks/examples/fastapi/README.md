# Printify Webhooks - FastAPI Example

Minimal example of receiving Printify webhooks with `X-Pfy-Signature` HMAC-SHA256 verification.

## Prerequisites

- Python 3.9+
- A Printify shop and API token with the `webhooks.write` scope
- A webhook created through the API with a `secret` (Printify webhooks are API-only)

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

3. Set `PRINTIFY_WEBHOOK_SECRET` in `.env` to the `secret` you passed when creating the webhook.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000, and the webhook endpoint is `POST /webhooks/printify`.

## Test

```bash
pytest test_webhook.py
```

The tests sign payloads with Printify's algorithm, `sha256=` + `hex(HMAC-SHA256(secret, raw body))`, and cover valid, tampered, malformed and wrong-length signatures, non-JSON content types, and every event type.

## How Verification Works

1. The handler reads the **raw** bytes with `await request.body()`, so any content type verifies. It doesn't parse JSON before verifying.
2. It checks `X-Pfy-Signature` has the form `sha256=<hex>` and strips the prefix.
3. It computes `HMAC-SHA256(secret, raw body)` as hex, using the secret as a UTF-8 string, and compares it with `hmac.compare_digest`.
4. Printify sends no timestamp, so there is no replay window. Dedupe on the event `id`.

Handled events: `order:created`, `order:updated`, `order:line-item:canceled`, `order:sent-to-production`, `order:shipment:created`, `order:shipment:delivered`, `product:created`, `product:updated`, `product:publish:started`, `product:deleted`, `shop:disconnected`, `personalization-preview-task:processed`.

## Local Testing with Hookdeck

Use the Hookdeck CLI to receive webhooks locally (no account required):

```bash
npx hookdeck-cli listen 8000 printify --path /webhooks/printify
```

Create a webhook with the printed URL via `POST /v1/shops/{shop_id}/webhooks.json` (include your `secret`), then call `POST /v1/shops/{shop_id}/webhooks/{webhook_id}/simulate` to send a test delivery.
