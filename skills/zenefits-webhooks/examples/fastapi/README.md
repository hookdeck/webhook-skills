# TriNet Zenefits Webhooks - FastAPI Example

Minimal example of receiving TriNet Zenefits webhooks with `signature` header (HMAC-SHA256, hex) verification.

## Prerequisites

- Python 3.10+
- A Zenefits partner application with its webhook shared secret (not the OAuth client secret)

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

3. Add your application's webhook shared secret to `.env` as `ZENEFITS_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py
```

To receive real events locally, run the Hookdeck CLI in another terminal and use the URL it prints as your webhook URL (Zenefits requires HTTPS):

```bash
npx hookdeck-cli listen 8000 zenefits --path /webhooks/zenefits
```
