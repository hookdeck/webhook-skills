# Square Webhooks - FastAPI Example

Minimal example of receiving Square webhooks with FastAPI and manual signature
verification (HMAC-SHA256 over `notificationUrl + rawBody`, base64-encoded).

Square ships a Python SDK helper (`is_valid_webhook_event_signature`), but this
example verifies manually to keep the algorithm explicit and avoid an extra
dependency.

## Prerequisites

- Python 3.9+
- A Square webhook subscription with a **signature key** and **notification URL**
  (see [../../references/setup.md](../../references/setup.md))

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

3. Add your Square signature key and notification URL to `.env`:
   ```bash
   SQUARE_WEBHOOK_SIGNATURE_KEY=your_signature_key
   SQUARE_WEBHOOK_URL=https://your-app.com/webhooks/square
   ```

   > The notification URL is part of the signed content, so `SQUARE_WEBHOOK_URL`
   > must match the URL registered on your Square subscription exactly.

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook endpoint is at `POST /webhooks/square`, served from
http://localhost:8000.

## Local Testing

Expose your local server with the Hookdeck CLI (no account required) and use the
tunnel URL as your Square subscription's notification URL:

```bash
npx hookdeck-cli listen 8000 square --path /webhooks/square
```

Set `SQUARE_WEBHOOK_URL` to the same public tunnel URL, then trigger a test
event from **Webhooks → Subscriptions → Send Test Event** in the Square
Developer Console.

## Test

```bash
pytest test_webhook.py
```

The tests generate valid Square signatures —
`base64(HMAC-SHA256(notificationUrl + body, signatureKey))` — and assert the
endpoint returns `200` for valid signatures and `400` for missing, invalid, or
tampered requests.
