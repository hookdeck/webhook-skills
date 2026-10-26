# Zigpoll Webhooks - FastAPI Example

Minimal example of receiving Zigpoll webhooks with `X-Zigpoll-Signature` verification.

## Prerequisites

- Python 3.9+
- Zigpoll account with a webhook created under Integrations → Webhooks, and the account's Signing Secret (shown once)

## Setup

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the Signing Secret to `.env` (`ZIGPOLL_WEBHOOK_SECRET`).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

The handler reads the raw body with `await request.body()` in a dependency, verifies `X-Zigpoll-Signature` (`t=<unix ms>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`, any `v1` may match), then dispatches on the payload `type` (`submitted-responses` or `completed-survey`). The timestamp check is off by default because Hookdeck retries and replays resend the original timestamp; set `ZIGPOLL_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones (`t` is in milliseconds, the code converts it).

## Test

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 zigpoll --path /webhooks/zigpoll
```

Use the Hookdeck URL as the endpoint when you create the webhook in Zigpoll, then submit a response to the survey it is attached to.
