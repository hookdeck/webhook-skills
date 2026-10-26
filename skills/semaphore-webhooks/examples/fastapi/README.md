# Semaphore CI Webhooks - FastAPI Example

Minimal example of receiving Semaphore CI notification webhooks with signature verification.

## Prerequisites

- Python 3.9+
- A Semaphore notification with a webhook secret (see [references/setup.md](../../references/setup.md))

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

3. Put the `WEBHOOK_SECRET` value of the organization secret named on the notification into `.env` as `SEMAPHORE_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts GET, POST, PUT, PATCH and DELETE on `/webhooks/semaphore`.

## Test

```bash
pytest test_webhook.py
```

To receive real notifications locally, tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 semaphore --path /webhooks/semaphore
```
