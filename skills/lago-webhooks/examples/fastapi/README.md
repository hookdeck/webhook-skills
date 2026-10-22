# Lago Webhooks - FastAPI Example

Minimal example of receiving Lago webhooks (HMAC mode) with signature verification.

## Prerequisites

- Python 3.10+
- Lago account with a webhook endpoint created with signature algorithm **hmac** (Lago defaults to `jwt`, which this example does not handle)

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

3. Add your organization's HMAC Signature Token (Lago app > Developers > Webhooks) to `.env` as `LAGO_HMAC_KEY`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

## Receive Webhooks Locally

Use the Hookdeck CLI — no account required, one paste-and-run line:

```bash
npx hookdeck-cli listen 8000 lago --path /webhooks/lago
```

Paste the printed URL into Lago when adding the webhook endpoint (choose **HMAC**), then trigger an event such as creating a customer.

## Endpoint

- `POST /webhooks/lago` — Verifies `X-Lago-Signature` against the raw body (`await request.body()`) and handles events
- `GET /health` — Health check
