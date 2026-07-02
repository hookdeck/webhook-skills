# Razorpay Webhooks - FastAPI Example

Minimal example of receiving Razorpay webhooks with FastAPI. Razorpay only ships
a Node SDK for webhook validation, so this example verifies the signature
**manually** with Python's `hmac` (HMAC-SHA256, hex, timing-safe compare).

## Prerequisites

- Python 3.10+
- A Razorpay account with a webhook configured (and its secret)

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

3. Add your Razorpay webhook secret to `.env` as `RAZORPAY_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook endpoint is `POST /webhooks/razorpay` (served at
http://localhost:8000/webhooks/razorpay).

## Test

```bash
pytest test_webhook.py
```

The tests generate real HMAC-SHA256 signatures and exercise the endpoint.

## Receive Real Webhooks Locally

Use the Hookdeck CLI to tunnel Razorpay webhooks to your local server (no
install, no account required):

```bash
npx hookdeck-cli listen 8000 razorpay --path /webhooks/razorpay
```

Point your Razorpay dashboard webhook URL at the tunnel URL the CLI prints, then
trigger a test-mode payment to see events arrive.

## How It Works

- The handler reads the **raw body** with `await request.body()` before parsing —
  parsing JSON first would break the HMAC.
- `verify_razorpay_webhook` recomputes HMAC-SHA256 (hex) over the raw body and
  compares it to the `X-Razorpay-Signature` header with `hmac.compare_digest`
  (timing-safe).
- An invalid or missing signature returns **400**; verified events return
  **200**.
- The event type comes from the JSON body's `event` field.
