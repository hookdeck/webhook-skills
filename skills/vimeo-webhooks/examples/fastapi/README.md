# Vimeo Webhooks - FastAPI Example

Minimal example of receiving Vimeo app webhooks with signature verification
using FastAPI. Vimeo has no webhook SDK, so the `X-Webhook-Signature` header is
verified **manually** with Python's `hmac` module.

## Prerequisites

- Python 3.10+
- A Vimeo app webhook with a `secret` set (deliveries are unsigned without one)

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

3. Add the webhook `secret` you set through the Vimeo API to `.env`:
   ```bash
   VIMEO_WEBHOOK_SECRET=your_webhook_secret
   ```

   Create or update the webhook with a `secret` (`POST` or `PATCH`
   `/apps/{app_id}/webhooks`); see the skill's `references/setup.md`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 with the webhook endpoint at
`POST /webhooks/vimeo`.

## Test

Run the automated tests (they generate real HMAC-SHA256 signatures):

```bash
pytest test_webhook.py
```

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel Vimeo webhooks to your local server (no account
required):

```bash
npx hookdeck-cli listen 8000 vimeo --path /webhooks/vimeo
```

Set the public URL the CLI prints as the webhook's `webhook_url` through the
Vimeo API.

## How It Works

- The route reads the **raw body** with `await request.body()`; parsing JSON
  first would break the signature.
- `verify_vimeo()` recomputes the hex HMAC-SHA256 of the raw body, checks the
  header is 64 hex characters, and compares bytes with `hmac.compare_digest`.
- The event name is the `webhook_type` field in the body.
- Missing or invalid signatures return `401`; verified events return `200`.
