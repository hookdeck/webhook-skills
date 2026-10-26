# TheirStack Webhooks - FastAPI Example

Minimal example of receiving TheirStack webhooks with signature verification.

## Prerequisites

- Python 3.10+
- TheirStack account with a webhook that has a signing secret

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

3. Add your TheirStack webhook signing secret to `.env` as `THEIRSTACK_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 8000 theirstack --path /webhooks/theirstack
```

Use the printed URL as the **Webhook URL** on your TheirStack webhook, then click **Send test event**.

### Run the tests

```bash
pytest test_webhook.py
```

## Endpoint

- `POST /webhooks/theirstack` - Receives and verifies TheirStack webhook events

## Notes

- The signature header is `X-TheirStack-Signature-256: sha256=<hex>` (HMAC-SHA256 of the raw body). It is only sent when a signing secret is set; unsigned deliveries are rejected with 401.
- The digests are compared as bytes so a non-ASCII header returns 401, not 500.
- The event name is in the body: `{ id, type, payload }`.
