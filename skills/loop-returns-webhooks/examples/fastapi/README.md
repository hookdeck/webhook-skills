# Loop Returns Webhooks - FastAPI Example

Minimal example of receiving Loop Returns webhooks with `X-Loop-Signature` verification.

## Prerequisites

- Python 3.9+
- A Loop Returns account with access to Developer Tools in the Loop Admin, and a webhook secret

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

3. Add your Loop webhook secret to `.env` as `LOOP_WEBHOOK_SECRET` (Loop Admin → Settings → Developer Tools)

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000, and the webhook endpoint is `POST /webhooks/loop-returns`.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads with Loop's algorithm, `base64(HMAC-SHA256(secret, raw body))`, and cover valid, wrong-secret, tampered, missing and non-JSON bodies, and every trigger.

## How Verification Works

1. The handler reads `await request.body()`, so it verifies the exact bytes Loop sent, whatever the `Content-Type`.
2. It computes `HMAC-SHA256(secret, raw body)` as **standard base64** and compares it to `X-Loop-Signature` with `hmac.compare_digest`.
3. Only after verification does it parse the JSON and dispatch on `payload["trigger"]`.

Handled triggers: `return.created`, `return.updated`, `return.closed`, `return.processing.failed`, `label.created`, `label.updated`, `restock.requested`, `giftcard.requested`, `shipment.processed`.

## Local Testing with Hookdeck

Use the Hookdeck CLI to receive webhooks locally (no account required):

```bash
npx hookdeck-cli listen 8000 loop-returns --path /webhooks/loop-returns
```

Add the printed URL as a webhook in the Loop Admin under **Settings → Developer Tools**, pick a topic and trigger, and use a test return to send a payload.
