# Modem Pay Webhooks - FastAPI Example

Minimal example of receiving Modem Pay webhooks with `x-modem-signature` verification.

## Prerequisites

- Python 3.9+
- A Modem Pay webhook secret (dashboard: Developers > Webhooks), or the test secret printed by `modempay listen`

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

3. Add your webhook secret to `.env` (`MODEM_PAY_WEBHOOK_SECRET`), exactly as Modem Pay shows it.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 (the route is `POST /webhooks/modem-pay`)

The handler reads the raw body with `await request.body()` in a dependency. It checks `x-modem-signature` = hex HMAC-SHA512 of the raw body (128 characters, compared case-insensitively in constant time) before parsing anything, and answers 401 when the header is missing, malformed or wrong. A signed body that isn't a JSON object with a string `event` and an object `payload` gets 400. Unknown events are acknowledged with 200 so Modem Pay doesn't retry them.

## Test

```bash
pytest test_webhook.py
```

To receive real webhooks locally, either use Modem Pay's CLI in test mode:

```bash
modempay listen --forward-url=http://localhost:8000/webhooks/modem-pay
modempay trigger charge.succeeded
```

or a Hookdeck tunnel (register the URL it prints with Modem Pay):

```bash
npx hookdeck-cli listen 8000 modem-pay --path /webhooks/modem-pay
```
