# Threads Webhooks - FastAPI Example

Minimal example of receiving Threads (Meta) webhooks with the GET verification
handshake and `X-Hub-Signature-256` signature verification.

## Prerequisites

- Python 3.9+
- A [Meta for Developers](https://developers.facebook.com/) app with the Threads API use case and the Threads webhooks sub-use case

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add `THREADS_APP_SECRET` and `THREADS_VERIFY_TOKEN` to `.env`. The Threads docs
   don't say which app secret signs webhooks: use the secret of the app the webhook
   is configured on, and try the other (App Secret vs Threads App Secret) if
   verification fails.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 8000 threads --path /webhooks/threads
```

Use the tunnel URL as the **Callback URL** in the App Dashboard. Meta sends a `GET`
handshake to verify the URL, then `POST`s events.

### Run the tests

```bash
pytest test_webhook.py -v
```

## Endpoints

- `GET /webhooks/threads` - Verification handshake (echoes `hub.challenge`)
- `POST /webhooks/threads` - Receives and verifies `replies`, `mentions`, `publish` and `delete` notifications
