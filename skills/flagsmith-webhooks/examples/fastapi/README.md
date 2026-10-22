# Flagsmith Webhooks - FastAPI Example

Minimal example of receiving Flagsmith webhooks (environment, audit log and identity) with `X-Flagsmith-Signature` verification.

## Prerequisites

- Python 3.9+
- A Flagsmith project (Flagsmith Cloud or self-hosted) where you can add a webhook with a secret

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

3. Put the same value you enter in Flagsmith's **Secret** field into `.env` as `FLAGSMITH_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000

## Test

### Using Hookdeck CLI

```bash
npx hookdeck-cli listen 8000 flagsmith --path /webhooks/flagsmith
```

Paste the Hookdeck URL into the webhook URL field in Flagsmith, then change a flag's state to trigger a `FLAG_UPDATED` event.

### Run Unit Tests

```bash
pytest test_webhook.py -v
```

## Endpoint

- `POST /webhooks/flagsmith` — reads raw bytes with `request.body()`, verifies `X-Flagsmith-Signature` (hex HMAC-SHA256 of the raw body), and handles `FLAG_UPDATED`, `FLAG_DELETED`, `AUDIT_LOG_CREATED` and identity payloads.
