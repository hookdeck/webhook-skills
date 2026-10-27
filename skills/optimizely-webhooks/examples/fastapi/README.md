# Optimizely Webhooks - FastAPI Example

Minimal example of receiving Optimizely Feature Experimentation webhooks with `X-Hub-Signature` (HMAC-SHA1) verification.

## Prerequisites

- Python 3.9+
- An Optimizely Feature Experimentation project with a webhook (Settings → Webhooks) and its secret token

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

3. Add your webhook secret token to `.env` as `OPTIMIZELY_WEBHOOK_SECRET` (Optimizely shows it only once, right after the webhook is created)

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 8000 optimizely --path /webhooks/optimizely
```

Use the printed URL as the webhook URL in Optimizely, then publish a change to trigger `project.datafile_updated`.

### Run tests

```bash
pytest test_webhook.py
```

The tests include the test vector published in Optimizely's docs. The handler reads `await request.body()` so the exact bytes are verified. See [../../references/verification.md](../../references/verification.md).
