# ClickPost Webhooks - FastAPI Example

Minimal example of receiving ClickPost shipment status webhooks and authenticating them with
`Authorization: Token <secret>`.

ClickPost does not sign payloads. The handler checks the `Token` scheme (case-insensitively) and
compares the rest with your token in constant time with a FastAPI dependency that rejects bad tokens before the body is parsed. It then dispatches on
`clickpost_status_code` and dedupes on waybill + scan.

## Prerequisites

- Python 3.9+
- A ClickPost account (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `CLICKPOST_WEBHOOK_SECRET` to the bare token (without `Token `).

   Choose Simple Token authentication on the ClickPost webhook and paste the token.

## Run

```bash
uvicorn main:app --reload
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/clickpost`.

## Test

```bash
pytest test_webhook.py
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 clickpost --path /webhooks/clickpost
```

Or send one by hand:

```bash
curl -X POST http://localhost:8000/webhooks/clickpost \
  -H "Content-Type: application/json" \
  -H "Authorization: Token $CLICKPOST_WEBHOOK_SECRET" \
  -d '{"waybill":"TEST-AWB-HLD-123","cp_id":10001,"timestamp":"2024-11-19T10:04:20Z","clickpost_status_code":8,"clickpost_status_description":"Delivered"}'
```
