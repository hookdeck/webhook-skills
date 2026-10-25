# Certn Webhooks - FastAPI Example

Minimal example of receiving Certn webhooks with `Certn-Signature` verification.

## Prerequisites

- Python 3.9+
- Certn account with webhooks enabled on the Partner page, and signed payloads turned on so you have the signing secret

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the signing secret to `.env` (`CERTN_WEBHOOK_SECRET`). Signing is opt-in: without it Certn sends unsigned deliveries, which fail verification.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000

The handler reads the raw body with `await request.body()`, verifies `Certn-Signature` (`t=<unix seconds>, v1=<hex HMAC-SHA256 of "<t>.<request body>">`, accepting any of several `v1` values), then dispatches on the applicant object's `report_status` (for example `COMPLETE`). Certn has no event types. The timestamp check is off by default because retries and replays keep the original timestamp; set `CERTN_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 certn --path /webhooks/certn
```

Use the Hookdeck URL as the webhook URL on the Certn Partner page, then click Enable Integration.
