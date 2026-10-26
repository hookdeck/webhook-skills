# Remote Webhooks - FastAPI Example

Minimal example of receiving Remote webhooks with signature verification
(`X-Remote-Signature`: hex HMAC-SHA256 of `raw_body + b":" + X-Remote-Timestamp`).

## Prerequisites

- Python 3.9+
- A Remote webhook callback and its `signing_key` (see [../../references/setup.md](../../references/setup.md))

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

3. Set `REMOTE_WEBHOOK_SECRET` to the `signing_key` returned by `POST /v1/webhook-callbacks`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts events at `POST /webhooks/remote`.

## Test

```bash
pytest test_webhook.py
```

The tests include the published test vector from Remote's docs. To receive real events locally:

```bash
npx hookdeck-cli listen 8000 remote --path /webhooks/remote
```

Register the URL the CLI prints as your callback URL.
