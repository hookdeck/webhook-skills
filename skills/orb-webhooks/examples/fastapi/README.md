# Orb Webhooks - FastAPI Example

Minimal example of receiving Orb webhooks with signature verification using FastAPI.

## Prerequisites

- Python 3.9+
- Orb account with a webhook endpoint and signing secret

## Setup

1. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Add your Orb webhook signing secret to `.env` (from Orb Dashboard → Developers → Webhooks → your endpoint).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000.

## Test

```bash
pytest test_webhook.py
```

## Receive Webhooks Locally

Use the Hookdeck CLI — no account required, one paste-and-run line:

```bash
npx hookdeck-cli listen 8000 orb --path /webhooks/orb
```

The CLI prints a public URL. Paste it into the Orb dashboard as your webhook endpoint URL, then trigger events from Orb (or replay them from the Hookdeck UI).

## Endpoint

- `POST /webhooks/orb` — Receives and verifies Orb webhook events
- `GET /health` — Health check
