# Doppler Webhooks - FastAPI Example

Minimal example of receiving Doppler webhooks with signature verification.

## Prerequisites

- Python 3.9+
- Doppler project with a webhook configured and a **Secret** set (signing is optional in Doppler, but this example rejects unsigned requests)

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

3. Add your Doppler webhook Secret to `.env` as `DOPPLER_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 8000 doppler --path /webhooks/doppler
```

Then use the Hookdeck URL as the webhook URL in Doppler (Project > Webhooks > + Add).

### Trigger Test Events

Change a secret in a config the webhook is attached to. Doppler sends a `config.secrets.update` payload.

## Endpoint

- `POST /webhooks/doppler` - Receives and verifies Doppler webhook events (`X-Doppler-Signature`). Reads `await request.body()` so the signature is checked against the raw bytes.
