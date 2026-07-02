# Coinbase Commerce Webhooks - FastAPI Example

Minimal example of receiving Coinbase Commerce webhooks with signature
verification using FastAPI. The official Coinbase Commerce SDK is Node-only, so
this example verifies the `X-CC-Webhook-Signature` signature **manually** with
Python's `hmac` module.

## Prerequisites

- Python 3.9+
- A Coinbase Commerce account with a webhook shared secret

## Setup

1. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Add your Coinbase Commerce **shared secret** (Settings → Notifications):
   ```bash
   COINBASE_COMMERCE_WEBHOOK_SECRET=your_webhook_shared_secret_here
   ```

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook endpoint is available at
`POST http://localhost:8000/webhooks/coinbase-commerce`.

## Test

Run the automated tests (they generate real HMAC-SHA256 signatures):

```bash
pytest test_webhook.py -v
```

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel Coinbase Commerce webhooks to your local server
(no account required):

```bash
npx hookdeck-cli listen 8000 coinbase-commerce --path /webhooks/coinbase-commerce
```

Point your Coinbase Commerce endpoint URL (Settings → Notifications) at the
public URL the CLI prints, then create a test charge to trigger events.

## How It Works

- The handler reads `await request.body()` to get the **raw body** for signature
  verification (parsing JSON first would break the signature).
- `verify_signature()` computes an HMAC-SHA256 hex digest of the raw body and
  compares it to the `X-CC-Webhook-Signature` header with the timing-safe
  `hmac.compare_digest`.
- Invalid or missing signatures return `400`; verified events return `200`.
