# Dentally Webhooks - FastAPI Example

Minimal example of receiving Dentally webhooks with signature verification (`X-Dentally-Signature`, HMAC-SHA256 hex of the raw body).

## Prerequisites

- Python 3.9+
- A Dentally webhook endpoint with a secret string you chose

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

3. Set `DENTALLY_WEBHOOK_SECRET` in `.env` to the secret you set on the Dentally webhook

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the unit tests (they generate real signatures):

```bash
pytest test_webhook.py
```

To receive real webhooks locally, run the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 dentally --path /webhooks/dentally
```

Then create a Dentally webhook pointing at the URL it prints.

## Notes

- The handler reads `await request.body()` so the signature is checked over the exact bytes sent.
- `hmac.compare_digest` is called on bytes so a non-ASCII header yields `401`, not `500`.
- Unknown events return `204 No Content`, as Dentally recommends.
- Invalid signatures return `401`; each non-2xx counts toward Dentally's 50-failure auto-disable limit.
