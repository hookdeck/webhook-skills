# Mautic Webhooks - FastAPI Example

Minimal example of receiving Mautic webhooks with `Webhook-Signature` verification.

## Prerequisites

- Python 3.10+
- Mautic instance with a webhook and its secret

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

3. Add your Mautic webhook secret to `.env`

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
npx hookdeck-cli listen 8000 mautic --path /webhooks/mautic
```

Use the Hookdeck URL as the Webhook POST URL in Mautic (Webhooks → your webhook), then click **Send Test Payload**.

## Endpoint

- `POST /webhooks/mautic` - Receives and verifies Mautic webhook events
