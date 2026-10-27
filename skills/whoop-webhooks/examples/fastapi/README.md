# WHOOP Webhooks - FastAPI Example

Minimal example of receiving WHOOP webhooks with `X-WHOOP-Signature` verification.

## Prerequisites

- Python 3.9+
- A WHOOP app in the [WHOOP Developer Dashboard](https://developer-dashboard.whoop.com/)

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

3. Add your WHOOP app's client secret to `.env` as `WHOOP_WEBHOOK_SECRET`. WHOOP signs webhooks with it; there is no separate webhook secret.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and receives `POST /webhooks/whoop`.

## Test

```bash
pytest test_webhook.py
```

The tests generate real signatures (`base64(HMAC-SHA256(secret, timestamp + rawBody))`).

### Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 whoop --path /webhooks/whoop
```

Set the printed Hookdeck URL as the Webhook URL on your app in the WHOOP Developer Dashboard.

## Notes

- The handler reads the exact bytes with `await request.body()`, verifies, then parses JSON.
- Old timestamps are accepted by default. Set `WHOOP_WEBHOOK_TOLERANCE_SECONDS` to opt in to a window (the timestamp is Unix milliseconds).
