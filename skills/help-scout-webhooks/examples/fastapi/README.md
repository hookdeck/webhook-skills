# Help Scout Webhooks - FastAPI Example

Minimal example of receiving Help Scout webhooks with signature verification (`X-HelpScout-Signature`, base64 HMAC-SHA1 of the raw body).

## Prerequisites

- Python 3.10+
- Help Scout account with access to Workspace > Apps > Webhooks

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

3. Add the secret key you set in the Help Scout Webhooks app to `.env` as `HELPSCOUT_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. The webhook endpoint is `POST /webhooks/help-scout`.

## Test

Run the automated tests (they sign payloads with the real algorithm, including the test vector from the Help Scout docs):

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally, start a tunnel (no account required):

```bash
npx hookdeck-cli listen 8000 help-scout --path /webhooks/help-scout
```

Use the URL it prints as the callback URL in the Help Scout Webhooks app, then trigger an event such as creating a conversation.

## Notes

- The handler reads `await request.body()` so the signed bytes stay untouched. Never use `request.json()` before verifying.
- Return 400 for a bad signature. A 410 response makes Help Scout delete the webhook.
