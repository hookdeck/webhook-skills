# Column Webhooks - FastAPI Example

Minimal example of receiving Column webhooks with `Column-Signature` verification.

## Prerequisites

- Python 3.9+
- Column account with a webhook endpoint and its signing secret (Dashboard → Webhook settings)

## Setup

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the endpoint's signing secret to `.env` (`COLUMN_WEBHOOK_SECRET`).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

The handler reads the raw body with `await request.body()` in a dependency, verifies `Column-Signature` (lowercase hex HMAC-SHA256 of the raw body, keyed with the signing secret), then dispatches on the payload `type` (`ach.outgoing_transfer.completed`, `ach.outgoing_transfer.returned`, `book.transfer.completed`) and logs the rest. No timestamp is signed, so there is no replay window; dedupe on the event `id`.

## Test

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 column --path /webhooks/column
```

Use the Hookdeck URL as the endpoint URL when you create the webhook in Column, then trigger a transfer in the sandbox.
