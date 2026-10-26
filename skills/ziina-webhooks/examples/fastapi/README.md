# Ziina Webhooks - FastAPI Example

Minimal example of receiving Ziina webhooks with `X-Hmac-Signature` verification.

## Prerequisites

- Python 3.9+
- A Ziina account. Set a secret when you register the webhook through the Ziina API. Without one, deliveries are unsigned and fail verification.

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put the `secret` you gave to `POST /webhook` in `.env` as `ZIINA_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000, webhook route `POST /webhooks/ziina`.

## Test

```bash
pytest test_webhook.py
```

To receive real deliveries locally:

```bash
npx hookdeck-cli listen 8000 ziina --path /webhooks/ziina
```

Register the Hookdeck URL with `POST /webhook` (with your secret), then trigger a payment intent or refund.

## Notes

- The route reads `await request.body()` so the exact bytes are verified; JSON is parsed after the check.
- Missing, malformed or mismatching signature returns `401`.
