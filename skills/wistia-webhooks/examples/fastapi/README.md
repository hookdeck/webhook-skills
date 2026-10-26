# Wistia Webhooks - FastAPI Example

Minimal example of receiving Wistia webhooks with signature verification (`X-Wistia-Signature`, HMAC-SHA256 hex of the raw body). Wistia has no webhook SDK, so verification uses Python's `hmac` and `hashlib`.

## Prerequisites

- Python 3.10+
- Wistia account with a webhook configured (Account Settings → Webhooks) and its Secret Key

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

3. Add the Secret Key you entered for the webhook in Wistia to `.env` as `WISTIA_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

### Run the tests

```bash
pytest test_webhook.py -v
```

The tests sign payloads with Wistia's real algorithm (lowercase hex HMAC-SHA256 of the raw body) and cover valid, batched, duplicate, missing, malformed, wrong-secret and tampered requests.

### Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 wistia --path /webhooks/wistia
```

Paste the public URL the CLI prints into the **POST URL** field of a new webhook in Wistia (Account Settings → Webhooks), enter a Secret Key and use the same value as `WISTIA_WEBHOOK_SECRET`, then upload or play a video to trigger `media.created`, `media.ready` or `viewing_session.play`.

## Endpoint

- `POST /webhooks/wistia` - Receives and verifies Wistia webhook deliveries (401 on a bad signature)
- `GET /health` - Health check
