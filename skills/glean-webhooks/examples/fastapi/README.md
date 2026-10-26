# Glean Webhooks - FastAPI Example

Minimal example of receiving Glean trigger webhooks with Standard Webhooks signature verification.

## Prerequisites

- Python 3.9+
- A Glean trigger created with `POST /api/triggers` (its `signing_secret` is returned only once)

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

3. Add the trigger's `signing_secret` (`whsec_...`) to `.env` as `GLEAN_SIGNING_SECRET`. If you created the trigger with `delivery.auth` type `BEARER`, set `GLEAN_DELIVERY_BEARER` too.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and the endpoint is `/webhooks/glean`.

## Test

```bash
pytest test_webhook.py
```

To receive real deliveries locally:

```bash
npx hookdeck-cli listen 8000 glean --path /webhooks/glean
```

Use the printed HTTPS URL as the trigger's `delivery.webhook_url`.

## Notes

- The `standardwebhooks` library always enforces a 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so late ones are rejected; see `references/verification.md` for a manual verifier with a configurable window.
- The raw body is read with `request.body()` so the signature is checked for any content type.
