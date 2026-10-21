# Castle Webhooks - FastAPI Example

Minimal example of receiving Castle webhooks with `X-Castle-Signature` verification (base64 HMAC-SHA256 of the raw body, keyed with your API secret).

## Prerequisites

- Python 3.9+
- Castle account with your API secret

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

3. Add your Castle API secret to `.env` as `CASTLE_API_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

To receive real webhooks locally (no account required):

```bash
npx hookdeck-cli listen 8000 castle --path /webhooks/castle
```

Use the Hookdeck URL as the webhook endpoint in Castle's dashboard (Policy or Lists → Integrations → Add Integration).

## Events handled

`$policy.matched`, `$list_item.created`, `$list_item.archived`, `$list_item.unarchived`
