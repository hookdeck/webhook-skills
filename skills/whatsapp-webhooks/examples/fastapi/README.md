# WhatsApp Webhooks - FastAPI Example

Minimal example of receiving WhatsApp (Meta Cloud API) webhooks with FastAPI,
including the GET verification handshake and `X-Hub-Signature-256` signature
verification.

## Prerequisites

- Python 3.9+
- A Meta app with the WhatsApp product added (for the **app secret** and a
  **verify token** you choose)

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

3. Set values in `.env`:
   - `WHATSAPP_APP_SECRET` — App Dashboard → App Settings → Basic → App Secret
   - `WHATSAPP_VERIFY_TOKEN` — any random string; paste the same value into the dashboard

## Run

```bash
uvicorn main:app --reload --port 8000
```

- `GET /webhooks/whatsapp` — Meta verification handshake (echoes `hub.challenge`)
- `POST /webhooks/whatsapp` — event delivery (verifies the signature)

## Test

```bash
pytest test_webhook.py -v
```

## Local Development

Expose your local server with the Hookdeck CLI (no account required) and use the
printed URL as the Callback URL in the WhatsApp dashboard:

```bash
npx hookdeck-cli listen 8000 whatsapp --path /webhooks/whatsapp
```

## Key Points

- **Manual verification** — Meta's `whatsapp` SDK is Node-only and doesn't verify
  webhooks, so this Python example computes the HMAC-SHA256 digest manually.
- **Raw body** — `await request.body()` is read before parsing, so the signature is
  verified against the exact bytes Meta signed (it escapes unicode; re-serialized
  JSON fails).
- **Echo the challenge** — the GET handshake returns the raw `hub.challenge` as
  `text/plain`, not JSON.
