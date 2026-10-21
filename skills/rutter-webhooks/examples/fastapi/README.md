# Rutter Webhooks - FastAPI Example

Minimal example of receiving Rutter webhooks with signature verification (`X-Rutter-Signature` / `X-Rutter-Signatures`, HMAC-SHA256, base64).

## Prerequisites

- Python 3.10+
- Rutter account with your client secret

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

3. Add your Rutter client secret to `.env` as `RUTTER_CLIENT_SECRET`. During a secret rotation, also set `RUTTER_CLIENT_SECRET_PREVIOUS` to the expiring secret.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

Run the automated tests (they generate real signatures):

```bash
pytest test_webhook.py -v
```

### Receiving webhooks locally with Hookdeck CLI

```bash
npx hookdeck-cli listen 8000 rutter --path /webhooks/rutter
```

Then paste the Hookdeck URL as the webhook URL on the Platforms page of the Rutter dashboard.

## Endpoint

- `POST /webhooks/rutter` - Receives and verifies Rutter webhook events
- `GET /health` - Health check
