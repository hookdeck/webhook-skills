# dbt Cloud Webhooks - FastAPI Example

Minimal example of receiving dbt Cloud webhooks with signature verification.

## Prerequisites

- Python 3.10+
- dbt Cloud account (Starter or Enterprise) with a webhook and its secret token

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

3. Add your dbt Cloud webhook secret (`hmac_secret`) to `.env` as `DBT_CLOUD_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000, with the webhook endpoint at `POST /webhooks/dbt-cloud`.

## Test

Run the automated tests (they generate real signatures):

```bash
pytest test_webhook.py
```

To receive real webhooks locally, no account required:

```bash
npx hookdeck-cli listen 8000 dbt-cloud --path /webhooks/dbt-cloud
```

Use the URL it prints as the **Endpoint** of your dbt Cloud webhook (Account settings → Webhooks), then run a job.

## How Verification Works

dbt Cloud sends the lowercase hex HMAC-SHA256 of the raw body in the `Authorization` header (no `Bearer`, no prefix). The handler reads `await request.body()` so the signed bytes are untouched, then compares with `hmac.compare_digest`.
