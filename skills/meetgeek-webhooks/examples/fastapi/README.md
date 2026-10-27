# MeetGeek Webhooks - FastAPI Example

Minimal example of receiving MeetGeek webhooks with `X-MG-Signature` verification.

## Prerequisites

- Python 3.10+
- A MeetGeek account with the Public API webhook secret

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
3. Add the webhook secret configured for the MeetGeek Public API to `.env`

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 meetgeek --path /webhooks/meetgeek
```

The handler reads `await request.body()`, verifies the signature, then branches on `meeting_id`: present means `successful-analysis`, absent means `failed-analysis`.
