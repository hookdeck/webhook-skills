# Sendbird Webhooks - FastAPI Example

Minimal example of receiving Sendbird Chat webhooks with `x-sendbird-signature` verification (hex HMAC-SHA256 of the raw body, keyed with your **master** API token).

## Prerequisites

- Python 3.10+
- A Sendbird application with webhooks enabled and its master API token

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Sendbird **master API token** to `.env` as `SENDBIRD_API_TOKEN` (Dashboard > Settings > Application > General). Secondary API tokens do not work, and the master token is a full-access credential, so keep it server-side only.

## Run

```bash
python main.py
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally, run the Hookdeck CLI (no install or account required):

```bash
npx hookdeck-cli listen 8000 sendbird --path /webhooks/sendbird
```

Then set the Hookdeck URL as the webhook URL in Sendbird Dashboard > Settings > Chat > Webhooks, and enable the categories you want.

## Notes

- Verification uses the **raw body** and the `x-sendbird-signature` header. Do not use the legacy `x-signature` header: its value never matches when the body contains non-ASCII characters (such as emoji).
- Sendbird waits 5 seconds for a response and retries up to three times, so respond fast and process asynchronously.
- The handler reads `await request.body()` before any JSON parsing.
