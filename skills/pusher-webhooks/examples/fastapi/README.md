# Pusher Channels Webhooks - FastAPI Example

Minimal example of receiving Pusher Channels webhooks with signature verification using the official `pusher` Python SDK.

## Prerequisites

- Python 3.9+
- A Pusher Channels app (app id, key, secret, cluster)

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

3. Add your Pusher app credentials to `.env` (`PUSHER_APP_SECRET` signs the webhooks)

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts `POST /webhooks/pusher`.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 8000 pusher --path /webhooks/pusher
```

Paste the Hookdeck URL into your app's webhook settings in the Pusher dashboard, then subscribe to a channel to trigger `channel_occupied`.

## Test

```bash
pytest test_webhook.py
```

Tests build real `X-Pusher-Signature` values (hex HMAC-SHA256 of the raw body) and cover valid, tampered, missing-header, unknown-key, stale-timestamp and batched requests.

## Notes

- The handler reads `await request.body()` so the signed bytes are untouched.
- `validate_webhook` also rejects a `time_ms` more than 5 minutes from now. Pusher retries for up to 5 minutes, so late retries can be rejected; see `references/verification.md` for a manual HMAC check that skips this.
- Bad signatures return 400; Pusher retries non-2xx responses for 5 minutes.
