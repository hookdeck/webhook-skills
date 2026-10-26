# Jamie Webhooks - FastAPI Example

Minimal example of receiving Jamie webhooks with `x-jamie-signature` verification.

## Prerequisites

- Python 3.9+
- Jamie account (Plus plan or higher) with a webhook created using **Signature Verification**

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

3. Add your Jamie signing secret to `.env` (`JAMIE_WEBHOOK_SECRET`). Choose Signature Verification when creating the Jamie webhook and paste its signing secret. API key mode is not supported.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and the webhook route is `/webhooks/jamie`.

The handler reads the raw body in a dependency and checks `v0` = HMAC-SHA256 (hex) of `<t>.<raw body>`. Failures return 401. The timestamp window is off by default (`JAMIE_TIMESTAMP_TOLERANCE_SECONDS=0`). Jamie's docs recommend 300 seconds when Jamie calls you directly; behind Hookdeck keep it at 0, because Hookdeck retries and replays resend the original timestamp.

## Test

```bash
pytest test_webhook.py
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 jamie --path /webhooks/jamie
```

Use the Hookdeck URL as the webhook URL in Jamie (Settings → Integrations → Webhooks), then record a meeting to trigger `meeting.completed`.
