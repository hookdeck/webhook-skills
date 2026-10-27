# SurveyMethods Webhooks - FastAPI Example

Minimal example of receiving SurveyMethods webhooks with signature verification.

## Prerequisites

- Python 3.10+
- A SurveyMethods account on a plan with webhooks (Professional, Team Professional or Enterprise) and a webhook signing secret

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
3. Add your webhook signing secret (shown once after saving the webhook in Account > Webhooks) to `.env`

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
npx hookdeck-cli listen 8000 surveymethods --path /webhooks/surveymethods
```

The handler reads the raw body (`await request.body()`) before parsing, so the exact bytes are verified.
