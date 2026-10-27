# api.video Webhooks - FastAPI Example

Minimal example of receiving api.video webhooks with signature verification.

## Prerequisites

- Python 3.9+
- An api.video account with a webhook and its `signatureSecret`

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

3. Add the webhook's `signatureSecret` (`sig_sec_...`) to `.env` as `API_VIDEO_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

### Using Hookdeck CLI

```bash
npx hookdeck-cli listen 8000 api-video --path /webhooks/api-video
```

Use the Hookdeck URL as the webhook URL when you create the webhook (dashboard or `POST /webhooks`).

## Endpoint

- `POST /webhooks/api-video` - Verifies `X-Api-Video-Signature` (hex HMAC-SHA256 of the raw body, read with `await request.body()`) and dispatches on the body's `type`

## Run tests

```bash
pytest test_webhook.py -v
```
