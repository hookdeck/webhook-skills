# Partnero Webhooks - FastAPI Example

Minimal example of receiving Partnero webhooks with signature verification.

## Prerequisites

- Python 3.9+
- A Partnero program with an outgoing webhook (and its signing secret)

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
3. Add your webhook's signing secret (Program Settings > Webhooks) to `.env`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 partnero --path /webhooks/partnero
```

Then use the Hookdeck URL as the webhook URL in Partnero (Program Settings > Webhooks > Add Webhook).
The route reads `await request.body()` so the exact bytes are verified before the JSON is parsed.
