# Chatim Webhooks - FastAPI Example

Minimal example of receiving Chatim webhooks with signature verification.

## Prerequisites

- Python 3.9+
- Chatim account with a project webhook and its secret

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

3. Add your Chatim webhook secret to `.env` (`CHATIM_WEBHOOK_SECRET`). Chatim shows it once, when you create the webhook.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

The handler reads the raw body with `await request.body()` and verifies `X-Chatim-Signature` (`sha256=<hex>`): HMAC-SHA256 of `<X-Chatim-Timestamp>.<raw body>`. A bad signature gets `401`. The timestamp check is off by default because retries and replays keep the original timestamp; set `CHATIM_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 chatim --path /webhooks/chatim
```

Use the Hookdeck URL as the webhook URL in Chatim → your project → Webhooks, then click **Test** to send a sample `chat.started` event.
