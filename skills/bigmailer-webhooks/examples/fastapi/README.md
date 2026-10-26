# BigMailer Webhooks - FastAPI Example

Minimal example of receiving BigMailer webhooks with signature verification.

## Prerequisites

- Python 3.9+
- BigMailer account with a webhook endpoint and its signing secret

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

3. Add your BigMailer endpoint signing secret to `.env` (`BIGMAILER_WEBHOOK_SECRET`). It is shown with "show" in the Webhooks settings.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

The handler reads the raw body with `await request.body()` and verifies `X-BigMailer-Signature` (`t=<unix seconds>,v1=<hex>`): HMAC-SHA256 of `<t>.<raw body>`, accepting any `v1=` entry that matches. Missing, malformed, or mismatched signatures get a `401`. The timestamp check is off by default because retries and replays keep the original timestamp; set `BIGMAILER_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 bigmailer --path /webhooks/bigmailer
```

Use the Hookdeck URL as the endpoint URL in BigMailer's Webhooks settings.
