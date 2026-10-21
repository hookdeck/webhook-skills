# Maxio Webhooks - FastAPI Example

Minimal example of receiving Maxio (Chargify) webhooks with signature verification.

## Prerequisites

- Python 3.9+
- Maxio site with a Site Shared Key

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

3. Add your Site Shared Key to `.env` as `MAXIO_SHARED_KEY`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 8000 maxio --path /webhooks/maxio
```

Use the URL the CLI prints as your webhook endpoint in Maxio, then send a `test` event.

## Test

```bash
pytest test_webhook.py
```
