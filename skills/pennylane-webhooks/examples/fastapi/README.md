# Pennylane Webhooks - FastAPI Example

Minimal example of receiving Pennylane webhooks with `X-Pennylane-Signature` verification.

## Prerequisites

- Python 3.9+
- Pennylane API access with the `companies:webhook_subscriptions:all` scope, and a webhook subscription created through the API so you have its `secret`

## Setup

1. Create a virtualenv and install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the subscription `secret` to `.env` (`PENNYLANE_WEBHOOK_SECRET`). Pennylane returns it only once, in the create-subscription response.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

The handler reads the raw body with `await request.body()` in a dependency, verifies `X-Pennylane-Signature` (`t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`, any one of several `v1` values may match), then dispatches on the body's `event` (`customer_invoice.e_invoicing_status_updated`, `dms_file.created`, `supplier_invoice.e_invoicing_received`). A bad signature returns 400: Pennylane disables a subscription immediately on 401, 403, 404 or 410. The timestamp check is off by default because Hookdeck retries and replays keep the original timestamp; set `PENNYLANE_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
pytest test_webhook.py
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 pennylane --path /webhooks/pennylane
```

Use the Hookdeck URL as the `callback_url` when you create the subscription (it must be HTTPS).
