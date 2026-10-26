# Cloudsmith Webhooks - FastAPI Example

Minimal example of receiving Cloudsmith webhooks with signature verification (`X-Cloudsmith-Signature`, HMAC-SHA1).

## Prerequisites

- Python 3.10+
- A Cloudsmith repository webhook with an HMAC signature key

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

3. Add the webhook's HMAC signature key to `.env` as `CLOUDSMITH_WEBHOOK_SECRET`

Set an HMAC signature key on the Cloudsmith webhook. Without one, deliveries are unsigned and fail verification.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and receives webhooks at `POST /webhooks/cloudsmith`.

The route reads the body with `await request.body()` so the signature is computed over the exact bytes received. Leave the webhook's payload format on the default JSON object (or JSON array); form-encoded and template payloads are verified but then rejected with 400 because the handler expects JSON.

## Test

Run the automated tests (they generate real HMAC-SHA1 signatures):

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 cloudsmith --path /webhooks/cloudsmith
```

Put the printed URL in the webhook's Payload URL field in Cloudsmith, then send a `ping` from the webhook's page.
