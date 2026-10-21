# Ramp Webhooks - FastAPI Example

Minimal example of receiving Ramp webhooks with signature verification.

## Prerequisites

- Python 3.9+
- A Ramp developer app with an API access token able to create webhook subscriptions

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

3. Add the subscription `secret` (returned by `POST /developer/v1/webhooks`) to `.env` as `RAMP_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the unit tests (they generate real HMAC-SHA256 signatures):

```bash
pytest test_webhook.py -v
```

To receive real webhooks locally, start a tunnel (no account required):

```bash
npx hookdeck-cli listen 8000 ramp --path /webhooks/ramp
```

Create the subscription with the tunnel URL, return 2xx for the `webhooks.verification` request, then submit the challenge to `POST /developer/v1/webhooks/{id}/verify`. See [references/setup.md](../../references/setup.md).

## Endpoint

- `POST /webhooks/ramp` - verifies `X-Ramp-Signature` against the raw body
- `GET /health` - health check
