# LearnHouse Webhooks - FastAPI Example

Minimal example of receiving LearnHouse webhooks with `X-Webhook-Signature` verification, using FastAPI.

## Prerequisites

- Python 3.9+
- A LearnHouse organization with webhooks enabled (Pro) and the endpoint secret (`whsec_...`)

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

3. Add your LearnHouse endpoint secret to `.env`. Paste the whole secret, including the whsec_ prefix. LearnHouse uses it as a plain HMAC key.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts `POST /webhooks/learnhouse`.

## Test

```bash
pytest test_webhook.py
```

Tests generate real `sha256=<hex>` signatures (HMAC-SHA256 of the raw body).

## Receive real webhooks locally

LearnHouse rejects `localhost` targets, so expose your server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 learnhouse --path /webhooks/learnhouse
```

Use the tunnel URL as the endpoint URL in LearnHouse, then send a `ping` with `POST /api/v1/orgs/{org_id}/webhooks/{webhook_uuid}/test`.

## How verification works

The handler reads `await request.body()` and verifies the signature before parsing JSON. The signature must be 64 hex characters (with or without `sha256=`); it is decoded to bytes and compared with `hmac.compare_digest` against HMAC-SHA256 of the raw body keyed with the whole secret as UTF-8. A bad signature gets `401`.
