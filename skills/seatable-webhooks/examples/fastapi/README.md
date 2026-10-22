# SeaTable Webhooks - FastAPI Example

Minimal example of receiving SeaTable webhooks with signature verification.

## Prerequisites

- Python 3.10+
- A SeaTable base with a webhook whose **secret key** is set (without a secret SeaTable sends no signature header)

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put the webhook's secret key in `.env` as `SEATABLE_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

### Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 seatable --path /webhooks/seatable
```

Use the Hookdeck URL as the target URL of the webhook (base > Advanced > Webhooks), then add, edit or delete a row in the base.

## Endpoint

- `POST /webhooks/seatable` - Verifies `X-Seatable-Signature` against the raw body (any content type) and handles `insert_row`, `modify_row` and `delete_row` changes
