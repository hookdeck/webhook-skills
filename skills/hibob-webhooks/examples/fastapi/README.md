# HiBob (Bob) Webhooks - FastAPI Example

Minimal example of receiving HiBob (Bob) webhooks with `Bob-Signature` (HMAC-SHA512, base64) verification.

## Prerequisites

- Python 3.10+
- A Bob account with a webhook configured and its secret

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

3. Add your Bob webhook secret to `.env` as `HIBOB_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

To receive real events locally, run the Hookdeck CLI in another terminal and use the URL it prints as the webhook URL in Bob:

```bash
npx hookdeck-cli listen 8000 hibob --path /webhooks/hibob
```

Bob sends a `Ping test` request when you add the webhook; the handler returns `200` for it.
