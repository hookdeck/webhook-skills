# bundle.social Webhooks - FastAPI Example

Minimal example of receiving bundle.social webhooks with signature verification.
bundle.social has no Python SDK, so this example verifies the signature manually
with `hmac` from the standard library.

## Prerequisites

- Python 3.9+
- A bundle.social webhook and its signing secret
  ([Webhooks dashboard](https://bundle.social/dashboard/organization/webhooks))

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

3. Add your signing secret to `.env` as `BUNDLE_SOCIAL_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the test suite (it signs payloads with real HMAC-SHA256 signatures):

```bash
pytest test_webhook.py
```

### Receive real webhooks locally

bundle.social only delivers to HTTPS URLs. Forward deliveries to your local server
with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 bundle-social --path /webhooks/bundle-social
```

Add the HTTPS URL Hookdeck prints as a webhook in the bundle.social dashboard,
then publish a post (or resend an event from the dashboard).

## How It Works

- A FastAPI dependency reads `await request.body()` (the **raw bytes**) and checks
  the `x-signature` header: hex HMAC-SHA256 of the body with your signing secret,
  compared with `hmac.compare_digest`.
- Returns `400` on a missing/invalid signature and `200` once verified, including
  for event types the handler doesn't know.

## Endpoint

- `POST /webhooks/bundle-social` - Receives and verifies bundle.social webhooks
- `GET /health` - Health check
