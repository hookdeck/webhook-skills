# SavvyCal Webhooks - FastAPI Example

Minimal example of receiving SavvyCal webhooks with signature verification.

## Prerequisites

- Python 3.10+
- A SavvyCal webhook with its secret (see [../../references/setup.md](../../references/setup.md))

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

3. Add your SavvyCal webhook secret to `.env` as `SAVVYCAL_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

### Receive live webhooks locally

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 8000 savvycal --path /webhooks/savvycal
```

Point your SavvyCal webhook at the tunnel URL, then book, reschedule, or cancel a
meeting to trigger `event.created`, `event.rescheduled`, and `event.canceled`.

## How It Works

- Reads the **raw** body with `await request.body()`.
- Reads the `x-savvycal-signature` header.
- Computes HMAC-SHA256 (hex) of the raw body with the webhook secret.
- Strips an optional `sha256=` prefix and compares the hex case-insensitively with `hmac.compare_digest`.

## Endpoint

- `POST /webhooks/savvycal` - Receives and verifies SavvyCal webhook events
- `GET /health` - Health check
