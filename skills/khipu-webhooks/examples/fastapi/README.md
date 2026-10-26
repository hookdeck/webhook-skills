# Khipu Webhooks - FastAPI Example

Minimal example of receiving Khipu webhooks with signature verification.

## Prerequisites

- Python 3.9+
- Khipu collecting account and its merchant secret

> Only notifications API version 3.0 is supported. Version 1.3 notifications aren't signed this way and fail verification.

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

3. Add your Khipu merchant secret to `.env` (`KHIPU_WEBHOOK_SECRET`).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

The handler reads the raw bytes with `await request.body()` and verifies `x-khipu-signature` (`t=<unix ms>,s=<base64>`): base64 HMAC-SHA256 of `<t>.<raw body>`, keyed with the merchant secret. A bad or missing signature gets `401`. The timestamp check is off by default because retries and replays keep the original timestamp; set `KHIPU_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds to reject older ones.

## Test

```bash
pytest test_webhook.py
```

The tests include the worked example published in Khipu's docs.

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 khipu --path /webhooks/khipu
```

Use the Hookdeck URL as `notify_url` (with `notify_api_version` `"3.0"`) when creating a Khipu collection.
