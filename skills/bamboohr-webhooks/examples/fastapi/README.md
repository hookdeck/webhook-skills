# BambooHR Webhooks - FastAPI Example

Minimal example of receiving BambooHR employee webhooks with `X-BambooHR-Signature` verification.

## Prerequisites

- Python 3.9+
- A BambooHR Global or Permissioned webhook and its private key

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

3. Add the webhook's private key to `.env` as `BAMBOOHR_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the unit tests (they generate real HMAC-SHA256 signatures over body + timestamp):

```bash
pytest test_webhook.py
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 bamboohr --path /webhooks/bamboohr
```

Use the Hookdeck URL as the webhook URL in BambooHR (HTTPS is required).

## Endpoint

- `POST /webhooks/bamboohr` - reads the raw body (`await request.body()`), verifies `X-BambooHR-Signature` against the body followed by `X-BambooHR-Timestamp`, then handles Event-Based payloads by `type` (`employee.created`, `employee.updated`, `employee.deleted`, `company.*`) and Field-Based payloads by looping over `employees` (`Created`, `Updated` and `Deleted` actions). Invalid signatures get `401`.

Set `BAMBOOHR_WEBHOOK_TOLERANCE_SECONDS` to opt in to a timestamp window (off by default).
