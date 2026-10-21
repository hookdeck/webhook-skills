# Buildkite Webhooks - FastAPI Example

Minimal example of receiving Buildkite webhooks with token or signature verification.

## Prerequisites

- Python 3.9+
- Buildkite organization with access to Notification Services and a webhook token

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

3. Add your Buildkite webhook token to `.env` (`BUILDKITE_WEBHOOK_TOKEN`)

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

The handler accepts either `X-Buildkite-Token` (default token mode) or `X-Buildkite-Signature` (HMAC-SHA256 of `<timestamp>.<raw body>`; the timestamp check is off by default because retries and replays keep the original timestamp; set `BUILDKITE_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones).

## Test

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 buildkite --path /webhooks/buildkite
```

Use the Hookdeck URL as the webhook URL in Buildkite → Settings → Notification Services → Webhook. Saving the webhook sends a `ping` event.
