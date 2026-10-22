# Unit Webhooks - FastAPI Example

Minimal example of receiving Unit webhooks with `X-Unit-Signature` (HMAC-SHA1) verification.

## Prerequisites

- Python 3.10+
- A Unit webhook with a `token`

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

3. Set `UNIT_WEBHOOK_TOKEN` in `.env` to the token you set on the Unit webhook.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 8000 unit --path /webhooks/unit
```

Use the public URL the CLI prints as the webhook `url` in Unit.

## Endpoint

- `POST /webhooks/unit` - verifies `X-Unit-Signature` over the raw body (any content type), then handles each event in `data`
