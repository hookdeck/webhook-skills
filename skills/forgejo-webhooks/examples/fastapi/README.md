# Forgejo Webhooks - FastAPI Example

Minimal example of receiving Forgejo webhooks with signature verification (`X-Forgejo-Signature`, HMAC-SHA256).

## Prerequisites

- Python 3.9+
- A Forgejo (or Codeberg) repository, organization, or instance where you can add webhooks, and the webhook **Secret**

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

3. Add your Forgejo webhook Secret to `.env` as `FORGEJO_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and receives webhooks at `POST /webhooks/forgejo`.

The route reads the raw bytes with `await request.body()`, so the exact bytes are verified for any content type, and parses JSON only after the signature check. It dispatches on the `X-Forgejo-Event-Type` header.

## Test

Run the unit tests (they generate real signatures):

```bash
pytest test_webhook.py
```

To receive real deliveries locally:

```bash
npx hookdeck-cli listen 8000 forgejo --path /webhooks/forgejo
```

Then add the Hookdeck URL as the Target URL under **Settings → Webhooks → Add webhook → Forgejo**, and use these settings:

> Set a secret on the Forgejo webhook. Without one, deliveries are unsigned and fail verification. Set the webhook's HTTP method to POST and its content type to application/json. Form-encoded and GET deliveries sign the JSON payload rather than the request body and fail verification.

Use **Test Delivery** to send a `push` event.
