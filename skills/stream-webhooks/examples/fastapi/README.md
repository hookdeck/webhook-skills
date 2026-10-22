# Stream Webhooks - FastAPI Example

Minimal example of receiving Stream (getstream.io) webhooks with `X-Signature` verification.

## Prerequisites

- Python 3.10+
- A Stream app with its API secret
- Payload Compression (`enable_hook_payload_compression`) turned **off** if you route through Hookdeck

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

3. Add your Stream app API secret to `.env` as `STREAM_API_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 8000 stream --path /webhooks/stream
```

Then set the Hookdeck URL as `webhook_url` in your Stream app's `event_hooks` (or in the Dashboard) and send a message in a channel to trigger `message.new`.

## Endpoint

- `POST /webhooks/stream` - Receives and verifies Stream webhook events. The handler reads `await request.body()` so the exact bytes are verified.
