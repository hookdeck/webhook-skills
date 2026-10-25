# Nooks Webhooks - FastAPI Example

Minimal example of receiving Nooks webhooks with `x-webhook-signature` verification.

## Prerequisites

- Python 3.9+
- A Nooks workspace with access to **Integrations → Webhooks** settings

## Setup

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the signing key to `.env` (`NOOKS_WEBHOOK_SECRET`). Nooks shows it only once, after you save the webhook URL.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

The handler reads the raw body with `await request.body()`, verifies `x-webhook-signature` (`t=<unix ms>,s=<base64 HMAC-SHA256 of "<t>.<raw body>">`), then dispatches on the body's `event` field (`call.logged`). A request with no signature header gets 401, unless `NOOKS_ACCEPT_UNSIGNED_PING=true` (set it only while saving a URL that points straight at this app, for Nooks's unsigned activation ping): then it gets a 200 and isn't processed. The timestamp check is off by default because retries and replays keep the original timestamp; set `NOOKS_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones (`t` is milliseconds).

## Test

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 nooks --path /webhooks/nooks
```

Use the Hookdeck URL as the endpoint URL in Nooks. The activation ping Nooks sends when you save the URL is unsigned and may show as a failed verification in Hookdeck; later deliveries are signed. De-duplicate on `callData.callId`, not `eventId`.
