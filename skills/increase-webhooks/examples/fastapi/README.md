# Increase Webhooks - FastAPI Example

Minimal example of receiving Increase webhooks with signature verification.

## Prerequisites

- Python 3.9+
- Increase account with an Event Subscription (its `shared_secret` is the signing secret)

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

3. Add your Event Subscription's shared secret to `.env` (`INCREASE_WEBHOOK_SECRET`)

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

Increase uses the Standard Webhooks headers (`webhook-id`, `webhook-timestamp`, `webhook-signature`), but the secret is the raw `shared_secret` string used as UTF-8 bytes, so the handler verifies manually instead of using the `standardwebhooks` library. The dependency reads the body with `await request.body()`, so any content type verifies. The timestamp check is off by default because retries and replays keep the original timestamp; set `INCREASE_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 increase --path /webhooks/increase
```

Use the Hookdeck URL as the URL of an Event Subscription in Increase (in the dashboard, or `POST /event_subscriptions`). If you pick your own `shared_secret`, don't start it with `whsec_`.
