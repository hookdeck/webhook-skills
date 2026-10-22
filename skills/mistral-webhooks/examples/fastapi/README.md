# Mistral Webhooks - FastAPI Example

Minimal example of receiving Mistral AI Studio voice agent webhooks with signature verification.

## Prerequisites

- Python 3.10+
- Mistral AI Studio account with a webhook endpoint and its signing secret

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

3. Add your Mistral endpoint signing secret to `.env`

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
npx hookdeck-cli listen 8000 mistral --path /webhooks/mistral
```

Then register the Hookdeck URL as the endpoint in Mistral, and subscribe your agent to `call_started`, `call_ended` and `call_failed`.

## Endpoint

- `POST /webhooks/mistral` - Receives and verifies Mistral webhook events
