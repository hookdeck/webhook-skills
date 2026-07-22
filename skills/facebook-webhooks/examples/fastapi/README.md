# Facebook Webhooks - FastAPI Example

Minimal example of receiving Facebook (Meta Graph API) webhooks with FastAPI,
including the GET verification handshake and X-Hub-Signature-256 signature
verification.

## Prerequisites

- Python 3.9+
- A [Meta for Developers](https://developers.facebook.com/) app with the Webhooks
  product configured (App Secret + Verify Token)

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

3. Add your `FACEBOOK_APP_SECRET` and `FACEBOOK_VERIFY_TOKEN` to `.env`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 8000 facebook --path /webhooks/facebook
```

Use the tunnel URL as your **Callback URL** in App Dashboard → Webhooks.

### Run the tests

```bash
pytest test_webhook.py -v
```

## Endpoints

- `GET /webhooks/facebook` - Verification handshake (echoes `hub.challenge`)
- `POST /webhooks/facebook` - Receives and verifies Facebook webhook events
