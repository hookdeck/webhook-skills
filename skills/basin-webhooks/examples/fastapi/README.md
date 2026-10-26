# Basin Webhooks - FastAPI Example

Minimal example of receiving Basin form submission webhooks with signature verification.

## Prerequisites

- Python 3.10+
- A Basin form on the Growth plan or above (signed webhooks)

## Setup

1. Create a virtualenv and install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```
2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```
3. Add your signing secret (form dashboard > Integrations > Webhooks > Edit > Webhook Signing > Show) to `.env`

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 basin --path /webhooks/basin
```

The handler reads the raw body (`await request.body()`) before parsing, so JSON and form-urlencoded payloads both verify.
