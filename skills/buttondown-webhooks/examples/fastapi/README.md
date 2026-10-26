# Buttondown Webhooks - FastAPI Example

Minimal example of receiving Buttondown webhooks with `X-Buttondown-Signature` verification.

## Prerequisites

- Python 3.9+
- Buttondown account with a webhook that has a **signing key** set

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

3. Put the webhook's signing key in `.env` as `BUTTONDOWN_WEBHOOK_SECRET`. It is any string you chose in the webhook's "Signing key" field, used as-is. Set a signing key on the Buttondown webhook. Without one, deliveries are unsigned and fail verification.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

The handler reads the raw body with `await request.body()` in a dependency, verifies `X-Buttondown-Signature` (`sha256=<hex HMAC-SHA256 of the raw body>`; the prefix is optional here), then dispatches on the payload's `event_type` (for example `subscriber.created`, `subscriber.confirmed`, `email.sent`). Failures return `401`. No timestamp is signed, so there is no replay window.

## Test

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 buttondown --path /webhooks/buttondown
```

Use the Hookdeck URL as the webhook URL in Buttondown, with the same signing key in Hookdeck's Buttondown source.
