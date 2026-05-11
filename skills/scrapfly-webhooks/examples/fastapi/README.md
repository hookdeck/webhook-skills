# Scrapfly Webhooks - FastAPI Example

Minimal FastAPI example of receiving Scrapfly webhooks with signature verification.

## Prerequisites

- Python 3.9+
- A Scrapfly account with a webhook configured (see [setup.md](../../references/setup.md))

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

3. Add your Scrapfly webhook signing secret to `.env`:
   ```bash
   SCRAPFLY_WEBHOOK_SECRET=<value-from-scrapfly-dashboard>
   ```

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000.

## Test

```bash
pytest test_webhook.py -v
```

The tests generate valid Scrapfly signatures (`upper(hex(HMAC_SHA256(secret, body)))`) — the same algorithm Scrapfly's docs document — and assert the endpoint accepts/rejects accordingly.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 8000 scrapfly --path /webhooks/scrapfly
```

Paste the printed public URL into your Scrapfly dashboard webhook configuration.

## Endpoint

- `POST /webhooks/scrapfly` — Receives and verifies Scrapfly webhook deliveries
- `GET /health` — Health check

## How It Works

The handler reads the raw bytes with `await request.body()`, computes `hmac.new(secret, body, sha256).hexdigest().upper()`, and constant-time-compares it to `X-Scrapfly-Webhook-Signature` (uppercased). Only after verification does it `json.loads` the payload and route by `X-Scrapfly-Webhook-Resource-Type` (`scrape` / `extraction` / `screenshot`) or by the Crawler `event` field.
