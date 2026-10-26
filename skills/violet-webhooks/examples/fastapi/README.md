# Violet Webhooks - FastAPI Example

Minimal example of receiving Violet webhooks with `X-Violet-Hmac` signature verification.

## Prerequisites

- Python 3.10+
- A Violet channel app and its app secret

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

3. Add your Violet app secret to `.env` as `VIOLET_WEBHOOK_SECRET` (the same secret you send as `X-Violet-App-Secret` to the Violet API)

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000, with the webhook endpoint at `POST /webhooks/violet`.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign each request the way Violet does (base64 HMAC-SHA256 of the raw body) and cover bad, missing and malformed signatures.

To receive real webhooks locally, start a tunnel:

```bash
npx hookdeck-cli listen 8000 violet --path /webhooks/violet
```

Then register the tunnel URL as the `remote_endpoint` of a webhook, using `POST /v1/events/webhooks` on the Violet API (see `references/setup.md`).

## How it works

- A dependency reads `await request.body()` (the exact bytes) and checks the signature (401 on failure)
- The body is parsed only after the check
- The event comes from the `X-Violet-Topic` header; the body is the entity itself
