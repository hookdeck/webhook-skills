# GoCardless Webhooks - FastAPI Example

Minimal example of receiving GoCardless webhooks in FastAPI with **manual** signature
verification. GoCardless only ships a Node.js SDK for webhook parsing, so in Python we
verify the `Webhook-Signature` header ourselves — HMAC-SHA256 (hex) over the raw body
with a timing-safe comparison.

## Prerequisites

- Python 3.10+
- A GoCardless account with a webhook endpoint secret (see
  [../../references/setup.md](../../references/setup.md))

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

3. Add your GoCardless webhook endpoint secret to `.env` (or export it):

   ```bash
   export GOCARDLESS_WEBHOOK_SECRET=your_webhook_endpoint_secret
   ```

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook route is available at `POST http://localhost:8000/webhooks/gocardless`.

## How It Works

- The handler reads the **raw body** with `await request.body()` — GoCardless signs
  the exact bytes, so never parse JSON before verifying.
- `verify_signature()` recomputes HMAC-SHA256 (hex) over the raw body and compares it
  to the `Webhook-Signature` header with `hmac.compare_digest` (timing-safe).
- A webhook is a **batch** of up to 250 events, each dispatched by `resource_type` +
  `action`. Return `204 No Content` to acknowledge; keep handlers **idempotent on
  `event["id"]`** because GoCardless retries the whole batch on any non-2xx.

## Test

Run the included tests (they generate real signatures with the same HMAC-SHA256
algorithm GoCardless uses):

```bash
pytest test_webhook.py -v
```

## Receive Real Webhooks Locally

Use the Hookdeck CLI to tunnel live GoCardless webhooks to your local server — no
install and no account required:

```bash
npx hookdeck-cli listen 8000 gocardless --path /webhooks/gocardless
```

Set your GoCardless webhook endpoint URL to the tunnel URL the CLI prints, then create
a test payment/mandate in the Sandbox Dashboard to trigger events.
