# Kombo Webhooks - FastAPI Example

Minimal example of receiving Kombo webhooks with signature verification (`X-Kombo-Signature`, unpadded base64url HMAC-SHA256).

## Prerequisites

- Python 3.9+
- Kombo account with a Kombo Webhook Secret

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

3. Add your Kombo Webhook Secret to `.env` (Kombo dashboard > Configuration > Webhooks)

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

Receive Kombo webhooks locally with the Hookdeck CLI (no install, no account needed):

```bash
npx hookdeck-cli listen 8000 kombo --path /webhooks/kombo
```

Add the URL it prints as a webhook in the Kombo dashboard.

## Test

```bash
pytest test_webhook.py
```

Or use the test-request button in the Kombo dashboard's webhook list to send a signed dummy event.

## Notes

- The handler reads `await request.body()` so the signed bytes are preserved for any content type
- Never re-serialize the parsed JSON before verifying
