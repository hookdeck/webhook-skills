# Dwolla Webhooks - FastAPI Example

Minimal example of receiving Dwolla webhooks with signature verification.

## Prerequisites

- Python 3.9+
- Dwolla account with a webhook subscription (you choose the subscription secret)

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

3. Set `DWOLLA_WEBHOOK_SECRET` in `.env` to the `secret` you sent when creating the Dwolla webhook subscription.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000, with the webhook endpoint at `/webhooks/dwolla`.

## Test

Run the automated tests (they generate real HMAC-SHA256 signatures):

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 dwolla --path /webhooks/dwolla
```

Use the Hookdeck source URL as the `url` when creating the Dwolla webhook subscription.

## Notes

- Signature header: `X-Request-Signature-SHA-256` (hex HMAC-SHA256 of the raw body).
- The route reads `await request.body()` so the bytes are never re-encoded.
- Duplicate event IDs return 200 so Dwolla doesn't pause the subscription.
