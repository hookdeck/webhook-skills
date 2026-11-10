# Census Webhooks - FastAPI Example

Minimal example of receiving Census (Fivetran Activations) sync webhooks with signature verification (`X-Signature`, base64 HMAC-SHA256 of the raw body).

## Prerequisites

- Python 3.9+
- A Census / Fivetran Activations webhook created on a group through the Activations REST API, and its secret

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

3. Set `CENSUS_WEBHOOK_SECRET` in `.env` to the secret from the webhook creation flow.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

### Receive real webhooks locally with Hookdeck CLI

```bash
npx hookdeck-cli listen 8000 census --path /webhooks/census
```

Start the server and the CLI, then add a webhook in Census pointing at the Hookdeck URL the CLI prints and subscribe it to the sync events you want.

## Endpoint

- `POST /webhooks/census` - Receives and verifies Census webhook events. The handler uses `await request.body()` so the signature is checked against the raw bytes.
