# Exa Webhooks - FastAPI Example

Minimal example of receiving Exa Websets webhooks with `Exa-Signature` verification.

## Prerequisites

- Python 3.9+
- Exa account with an API key; the webhook `secret` is returned when you create the webhook

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

3. Add your Exa webhook secret to `.env` (`EXA_WEBHOOK_SECRET`)

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

The handler verifies `Exa-Signature` (`t=<unix>,v1=<hex>`, HMAC-SHA256 of `<t>.<raw body>`). The timestamp check is off by default because retries and replays keep the original timestamp; set `EXA_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 exa --path /webhooks/exa
```

Use the Hookdeck URL as the `url` when you create the webhook (`POST https://api.exa.ai/websets/v0/webhooks`), and copy the returned `secret` into `.env`. See [../../references/setup.md](../../references/setup.md).
