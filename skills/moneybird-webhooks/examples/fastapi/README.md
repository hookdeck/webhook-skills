# Moneybird Webhooks - FastAPI Example

Minimal example of receiving Moneybird webhooks with `Moneybird-Signature` verification.

## Prerequisites

- Python 3.9+
- Moneybird account with API access, and a webhook created through the API (`POST /{administration_id}/webhooks.json`) so you have its `secret`

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

3. Add the webhook's `secret` to `.env` (`MONEYBIRD_WEBHOOK_SECRET`). The API returns it only when the webhook is created; you can also reveal it on the webhook's detail page in Moneybird.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

The route depends on `verified_body`, which reads the raw body and verifies `Moneybird-Signature` (`t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`, accepting any matching `v1`) before any JSON parsing, then dispatches on `action` (for example `sales_invoice_state_changed_to_paid`). The timestamp check is off by default because retries and replays keep the original timestamp; set `MONEYBIRD_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
pytest test_webhook.py
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 moneybird --path /webhooks/moneybird
```

Use the Hookdeck URL as the `url` when you create the webhook with `POST https://moneybird.com/api/v2/{administration_id}/webhooks.json`. Moneybird checks that the URL answers `200` when you register it.
