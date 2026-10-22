# FireHydrant Webhooks - FastAPI Example

Minimal example of receiving FireHydrant webhooks with signature verification.

## Prerequisites

- Python 3.10+
- FireHydrant account (Owner permissions) with a webhook Secret

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

3. Add your FireHydrant webhook Secret to `.env`

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

### Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 firehydrant --path /webhooks/firehydrant
```

Use the Hookdeck URL as the webhook **URL** in FireHydrant (Settings → Webhooks), then update an incident or create a change event.

## Endpoint

- `POST /webhooks/firehydrant` - Verifies the `fh-signature` header (hex HMAC-SHA256 of the raw body) and handles `incident`, `change_event` and `signals_alerts` payloads.
