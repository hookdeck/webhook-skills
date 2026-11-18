# LiveKit Webhooks - FastAPI Example

Minimal example of receiving LiveKit webhooks (LiveKit Cloud or self-hosted
`livekit-server`) with signature verification.

LiveKit signs each delivery with a **JWT in the `Authorization` header** (bare token, no
`Bearer ` prefix): HS256 with your project **API secret**, `iss` = your **API key**, and a
`sha256` claim holding base64(SHA-256(raw body)). This example reads the raw body with
`await request.body()` and verifies both halves manually with
[PyJWT](https://pyjwt.readthedocs.io/) and `hashlib`, comparing with
`hmac.compare_digest`. The official alternative (package `livekit-api`) is:

```python
from livekit.api import TokenVerifier, WebhookReceiver

receiver = WebhookReceiver(TokenVerifier(api_key, api_secret))
event = receiver.receive(raw_body.decode(), auth_header)  # protobuf WebhookEvent
```

## Prerequisites

- Python 3.10+
- A LiveKit project API key + secret: the key you selected as the webhook's **Signing API
  key** (Cloud), or `webhook.api_key` in `config.yaml` (self-hosted)

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

3. Set `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` in `.env`. If either is missing, the
   handler rejects every request with 401 rather than skipping verification.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

## Local Testing with Hookdeck

```bash
npx hookdeck-cli listen 8000 livekit --path /webhooks/livekit
```

Use the printed HTTPS URL as the webhook URL in LiveKit Cloud (**Settings → Webhooks**),
or under `webhook.urls` in your self-hosted `config.yaml`. In Cloud, **Actions → Send a
test event** sends a real signed event.
