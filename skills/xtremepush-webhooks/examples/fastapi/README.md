# Xtremepush Webhooks - FastAPI Example

Minimal example of receiving Xtremepush webhooks with `X-Xtremepush-Signature` verification.

## Prerequisites

- Python 3.9+
- Xtremepush project with a webhook using the Signed Payload auth type (for the Webhook Secret Key)

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the Webhook Secret Key to `.env` (`XTREMEPUSH_WEBHOOK_SECRET`). Choose the Signed Payload auth type on the Xtremepush webhook and paste its Webhook Secret Key. Other auth types are unsigned and fail verification.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000

The handler accepts GET, POST, PUT, PATCH and DELETE on `/webhooks/xtremepush` (the docs don't name the method) and reads the raw body with `await request.body()`. It verifies `X-Xtremepush-Signature` first for every method (`t=<unix seconds>, v1=<hex HMAC-SHA256 of "<t>.<raw body>">`, accepting any of several `v1` values; a missing body is verified as zero bytes), answers `401` on failure, then dispatches on the body's `event` field (`message_send`, `message_delivery`) and logs the rest. The timestamp check is off by default because retries and replays keep the original timestamp; set `XTREMEPUSH_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 xtremepush --path /webhooks/xtremepush
```

Use the Hookdeck URL as the webhook URL in Xtremepush. Hookdeck's Xtremepush source pre-selects POST without managing the method, so allow any other method the sender uses on the source.
