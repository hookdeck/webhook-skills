# Storylane Webhooks - FastAPI Example

Minimal example of receiving Storylane demo alert webhooks with signature verification.

## Prerequisites

- Python 3.10+
- A Storylane account (Starter plan or above) with a webhook Verification Secret

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
3. Add your Webhook Verification Secret to `.env`

## Run

```bash
python main.py
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 storylane --path /webhooks/storylane
```

Then set the Hookdeck URL as the webhook URL in Storylane (Settings > Alerts) and use the
**Test webhook** button. The handler reads `await request.body()` (the raw bytes) before parsing
the JSON.
